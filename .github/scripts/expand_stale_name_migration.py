from pathlib import Path

path = Path('app.js')
text = path.read_text()
start = text.index('  const revisedStarterDisplayNames = {')
end = text.index('\n  };', start) + len('\n  };')
replacement = """  const revisedStarterDisplayNames = {
    [canonicalGeniProfileId('6000000003409427757')]: ['Arthur Tudor'],
    [canonicalGeniProfileId('6000000000307240333')]: ['Adolphus of Cambridge', 'Prince Adolphus of Cambridge', 'Adolphus Frederick of Cambridge'],
    [canonicalGeniProfileId('6000000001260403655')]: ['Augusta of Hesse-Kassel'],
    [canonicalGeniProfileId('6000000003245250586')]: ['Mary Adelaide of Cambridge', 'Princess Mary Adelaide of Cambridge'],
    [canonicalGeniProfileId('6000000000703284437')]: ['Alice of the United Kingdom'],
    [canonicalGeniProfileId('6000000003221640265')]: ['Louis of Battenberg'],
    [canonicalGeniProfileId('6000000003221554850')]: ['Victoria of Hesse'],
    [canonicalGeniProfileId('5495575341940116659')]: ['Andrew of Greece and Denmark'],
    [canonicalGeniProfileId('6000000003075330310')]: ['Alice of Battenberg'],
    [canonicalGeniProfileId('6000000003890906681')]: ['Ernest Augustus of Hanover'],
    [canonicalGeniProfileId('6000000003879438150')]: ['Sophia of Hanover'],
    [canonicalGeniProfileId('304430340510004215')]: ['Elizabeth Stuart'],
    [canonicalGeniProfileId('6000000003885198846')]: ['Mary Stuart'],
    [canonicalGeniProfileId('4033453667340030515')]: ['Anne Hyde'],
    [canonicalGeniProfileId('4033341615700026163')]: ['George of Denmark'],
    [canonicalGeniProfileId('6000000003891753089')]: ['Augusta of Saxe-Gotha'],
    [canonicalGeniProfileId('6000000003760910764')]: ['Frances Brandon'],
    [canonicalGeniProfileId('5466010055340136751')]: ['Katherine Willoughby'],
    [canonicalGeniProfileId('4087038607800049893')]: ['Edward of Kent', 'Prince Edward of Kent'],
    [canonicalGeniProfileId('6000000001543481636')]: ['Francis of Teck', 'Prince Francis of Teck']
  };"""
text = text[:start] + replacement + text[end:]
old = "...(saved.namePeriods || []).filter(period => period.source === 'local')"
new = "...(saved.namePeriods || []).filter(period => clean(period.id).startsWith('name-'))"
if text.count(old) != 1:
    raise SystemExit(f'Expected one local-period preservation rule, found {text.count(old)}')
text = text.replace(old, new, 1)
path.write_text(text)
