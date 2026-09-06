"""TronGrid adapter producing the shared graph schema."""

from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from graph.schema import AddressNode, Chain, TransferEdge

MAX_COUNTERPARTIES_PER_HOP = 25


def tron_hex_to_base58(value: str) -> str:
	"""Convert TronGrid's 41-prefixed hex address to Base58Check."""
	if not value or not value.startswith("41"):
		return value
	import hashlib
	payload = bytes.fromhex(value)
	checksum = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
	encoded_value = int.from_bytes(payload + checksum, "big")
	alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
	encoded = ""
	while encoded_value:
		encoded_value, remainder = divmod(encoded_value, 58)
		encoded = alphabet[remainder] + encoded
	return alphabet[0] * (len(payload + checksum) - len((payload + checksum).lstrip(b"\0"))) + encoded


def _get_json(url: str, api_key: str) -> dict | list:
	request = Request(url, headers={"TRON-PRO-API-KEY": api_key, "Accept": "application/json"})
	with urlopen(request, timeout=20) as response:
		import json
		return json.loads(response.read())


def _timestamp(value) -> datetime | None:
	if value is None:
		return None
	return datetime.fromtimestamp(float(value) / 1000, tz=timezone.utc).replace(tzinfo=None)


def trace_tron(seed_address: str, start_time: datetime, end_time: datetime, max_hops: int = 4, api_key: str = ""):
	start_ms = int(start_time.timestamp() * 1000)
	end_ms = int(end_time.timestamp() * 1000)
	visited = {seed_address}
	nodes = {seed_address: AddressNode(chain=Chain.TRON, address=seed_address)}
	edges = []
	frontier = [seed_address]
	for _ in range(max_hops):
		next_frontier = []
		for address in frontier:
			params = urlencode({"limit": 200, "only_confirmed": "true", "min_timestamp": start_ms, "max_timestamp": end_ms})
			native_url = f"https://api.trongrid.io/v1/accounts/{address}/transactions?{params}"
			token_url = f"https://api.trongrid.io/v1/accounts/{address}/transactions/trc20?{params}"
			responses = [_get_json(native_url, api_key), _get_json(token_url, api_key)]
			count = 0
			for index, payload in enumerate(responses):
				for row in payload.get("data", []):
					if count >= MAX_COUNTERPARTIES_PER_HOP:
						break
					if index == 0:
						contract = (row.get("raw_data", {}).get("contract") or [{}])[0].get("parameter", {}).get("value", {})
						sender = tron_hex_to_base58(contract.get("owner_address"))
						recipient = tron_hex_to_base58(contract.get("to_address"))
						amount, asset = float(contract.get("amount") or 0) / 1_000_000, "TRX"
						tx_hash = row.get("txID") or row.get("tx_id")
					else:
						sender, recipient = row.get("from"), row.get("to")
						token = row.get("token_info") or {}
						decimals = int(token.get("decimals") or 6)
						amount, asset = float(row.get("value") or 0) / (10 ** decimals), token.get("symbol") or "TRC20"
						tx_hash = row.get("transaction_id")
					if not sender or not recipient or not tx_hash:
						continue
					timestamp = _timestamp(row.get("block_timestamp"))
					edge = TransferEdge(Chain.TRON, tx_hash, sender, recipient, asset, amount, timestamp=timestamp)
					edges.append(edge)
					nodes.setdefault(sender, AddressNode(Chain.TRON, sender))
					nodes.setdefault(recipient, AddressNode(Chain.TRON, recipient))
					counterparty = recipient if sender == address else sender
					if counterparty not in visited:
						visited.add(counterparty)
						next_frontier.append(counterparty)
						count += 1
		frontier = next_frontier
		if not frontier:
			break
	return list(nodes.values()), edges
