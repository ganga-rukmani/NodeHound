import xml.etree.ElementTree as ET
import csv

ns = {'ns': 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ADVANCED_XML'}

tree = ET.parse('sdn_advanced.xml')
root = tree.getroot()

rows = []
for feature in root.iter('{%s}Feature' % ns['ns']):
    if feature.get('FeatureTypeID') == '992':  # Tron
        version_detail = feature.find('.//{%s}VersionDetail' % ns['ns'])
        if version_detail is not None and version_detail.text:
            rows.append({
                'address': version_detail.text.strip(),
                'label': 'OFAC_SANCTIONED',
                'category': 'sanctioned',
                'source': 'ofac_sdn_tron'
            })

with open('ofac_tron_labels.csv', 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=['address', 'label', 'category', 'source'])
    writer.writeheader()
    writer.writerows(rows)

print(f"Found {len(rows)} OFAC-sanctioned Tron addresses")