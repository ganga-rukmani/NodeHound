import csv

# Load classes
illicit_ids = set()
with open('elliptic_txs_classes.csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row['class'] == '1':  # illicit
            illicit_ids.add(row['txId'])

print(f"Total illicit transactions in dataset: {len(illicit_ids)}")

# Find edges where BOTH ends are illicit — a real illicit-to-illicit fund flow chain
chain_edges = []
with open('elliptic_txs_edgelist.csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row['txId1'] in illicit_ids and row['txId2'] in illicit_ids:
            chain_edges.append((row['txId1'], row['txId2']))

print(f"Illicit-to-illicit edges found: {len(chain_edges)}")
print("Sample chain (first 5):")
for edge in chain_edges[:5]:
    print(edge)