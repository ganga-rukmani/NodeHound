with open('sdn_advanced.xml', encoding='utf-8') as f:
    content = f.read()

idx = content.find('FeatureTypeID="992"', 60000)
print('Usage found at index:', idx)
if idx != -1:
    print(content[idx-300:idx+800])
else:
    print('No usage found after the definitions table')