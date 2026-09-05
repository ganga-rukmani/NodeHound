"""Common-input-ownership clustering for Bitcoin transactions."""


def cluster_by_common_input_ownership(raw_transactions: list[dict]) -> dict[str, str]:
	parent = {}

	def find(value):
		parent.setdefault(value, value)
		if parent[value] != value:
			parent[value] = find(parent[value])
		return parent[value]

	def union(left, right):
		left_root, right_root = find(left), find(right)
		if left_root != right_root:
			parent[right_root] = left_root

	for transaction in raw_transactions:
		inputs = [item for item in transaction.get("inputs", []) if item]
		for address in inputs[1:]:
			union(inputs[0], address)
	roots = {}
	result = {}
	for address in parent:
		root = find(address)
		roots.setdefault(root, f"btc-cluster-{len(roots) + 1}")
		result[address] = roots[root]
	return result
