import csv

with open("ofac_tron_labels.csv", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

for row in rows:
    if row["address"] == "TNmRfnSUXZoWWzxcDDbf95eGQYXt1mJDt8":
        row["label"] = "FUNNULL TECHNOLOGY INC"

with open("ofac_tron_labels.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["address", "label", "category", "source"])
    writer.writeheader()
    writer.writerows(rows)

print("Patched Funnull Tron label")