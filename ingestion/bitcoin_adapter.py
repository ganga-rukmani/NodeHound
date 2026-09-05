"""Blockstream Bitcoin adapter using public confirmed transaction data."""

from datetime import datetime
from urllib.request import urlopen
import json

from graph.schema import AddressNode, Chain, TransferEdge

MAX_COUNTERPARTIES_PER_HOP = 25


def _get(path: str):
	with urlopen(f"https://blockstream.info/api{path}", timeout=20) as response:
		return json.loads(response.read())


def _address(output: dict) -> str | None:
	return output.get("scriptpubkey_address")


def _address_transactions(address: str) -> list[dict]:
	transactions = []
	last_seen = None
	while True:
		path = f"/address/{address}/txs" if last_seen is None else f"/address/{address}/txs/chain/{last_seen}"
		page = _get(path)
		if not page:
			break
		transactions.extend(page)
		if len(page) < 25:
			break
		last_seen = page[-1].get("txid")
	return transactions


def trace_bitcoin(seed_address: str, start_time: datetime, end_time: datetime, max_hops: int = 4, project_id: str | None = None):
	del project_id
	visited = {seed_address}
	nodes = {seed_address: AddressNode(Chain.BITCOIN, seed_address)}
	edges = []
	raw_transactions = []
	frontier = [seed_address]
	for _ in range(max_hops):
		next_frontier = []
		for address in frontier:
			transactions = _address_transactions(address)
			for transaction in transactions:
				timestamp = datetime.fromtimestamp(transaction["status"]["block_time"]) if transaction.get("status", {}).get("block_time") else None
				if timestamp and not (start_time <= timestamp <= end_time):
					continue
				inputs = [
					(_address(item.get("prevout") or {}), (item.get("prevout") or {}).get("value", 0))
					for item in transaction.get("vin", [])
				]
				inputs = [(item, value) for item, value in inputs if item]
				outputs = [(item.get("scriptpubkey_address"), item.get("value", 0)) for item in transaction.get("vout", [])]
				outputs = [(item, value) for item, value in outputs if item]
				raw_transactions.append({"txid": transaction.get("txid"), "inputs": [item for item, _ in inputs], "outputs": outputs})
				total_input_value = sum(value for _, value in inputs)
				for sender, input_value in inputs:
					for recipient, value in outputs:
						if sender == recipient:
							continue
						allocation = value * input_value / total_input_value if total_input_value else 0
						edge = TransferEdge(Chain.BITCOIN, transaction.get("txid", ""), sender, recipient, "BTC", allocation / 100_000_000, timestamp=timestamp, block_number=transaction.get("status", {}).get("block_height"), evidence_type="utxo_allocation_inferred", edge_confidence=0.55)
						edges.append(edge)
						nodes.setdefault(sender, AddressNode(Chain.BITCOIN, sender))
						nodes.setdefault(recipient, AddressNode(Chain.BITCOIN, recipient))
						if recipient not in visited and len(next_frontier) < MAX_COUNTERPARTIES_PER_HOP:
							visited.add(recipient)
							next_frontier.append(recipient)
		frontier = next_frontier
		if not frontier:
			break
	return list(nodes.values()), edges, raw_transactions
