import csv

rows = []
for filename in ["tron_labels.csv", "ofac_tron_labels.csv"]:
    with open(filename, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows.extend(list(reader))

with open("tron_labels_master.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["address", "label", "category", "source"])
    writer.writeheader()
    writer.writerows(rows)

print(f"Merged {len(rows)} total Tron labels into tron_labels_master.csv")