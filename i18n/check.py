import json,sys,re
src=json.load(open('strings.json'))
lang=sys.argv[1]
d=json.load(open(f'{lang}.json'))
miss=[s for s in src if s not in d or not str(d[s]).strip()]
bad=[s for s in src if s in d and sorted(re.findall(r'\{\d+\}',s))!=sorted(re.findall(r'\{\d+\}',str(d[s])))]
jaleft=[s for s in src if s in d and re.search(r'[぀-ヿ]',str(d[s])) and lang!='ja']
print(lang,'total',len(src),'missing',len(miss),'placeholder-mismatch',len(bad),'kana-left',len(jaleft))
for s in (miss[:5]+bad[:5]+jaleft[:8]): print('  ',repr(s),'->',repr(d.get(s)))
m=json.load(open('manual_src.json')); 
try:
  mm=json.load(open(f'manual_{lang}.json')); ids=[x['id'] for x in m]; print('manual sections', len(mm), 'ids ok', [x['id'] for x in mm]==ids)
except Exception as e: print('manual', e)
