> Copied 2026-10-24 from .claude/scratch/search-poc3/ (untracked); scripts stay there: run.mjs, grade.mjs, dry.mjs.
Overall: **FAIL**

# Search POC v3 results

FIT (search 1): 5/6 (need >=5): ok. SAME HOST: 1/5 of search-1 fits matched on search 2 (miss allowed <=1): no. Spend: $0.3751 of $0.4 cap (CAP HIT, incomplete).
Instruction-word rule for notFound split: tokens in {list, give, last, the, with, their, and, of, in, a, an, to} or pure digits = instruction; all else = data.

## Case 1: https://www.google.com x "List the last 3 releases of Node.js with version and date"

### Search 1: outcome **fits**, fit true, host nodejs.org. Words: "Node.js releases". Links chosen: ["Node.js Releases Node.js https://nodejs.org › previous-releases","Node.js 26.12.1 (Current) Node.js https://nodejs.org › blog › release","Node.js 22.23.4 (LTS) Node.js https://nodejs.org › blog › release","Releases · nodejs/node GitHub https://github.com › nodejs › releases","Node.js® Download Archive Node.js https://nodejs.org › archive › current"]. Cost after: $0.0072
- {"what":"site snapshot","url":"https://www.google.com/","chars":1881,"bot":false}
- {"what":"code picked box","line":"- combobox \"Zoek\" [expanded=false] [ref=133]"}
- {"what":"ai words","raw":"{\"words\":\"Node.js releases\"}"}
- {"what":"results page","url":"https://www.google.com/search?q=Node.js+releases&sca_esv=5beb0b408f23f4f0&sxsrf=APpeQnvzj4werY2K71HalHfDf7HO7BcQ6A%3A1792864374948&source=hp&ei=dvDcav-_N_mei-gP7cL2oQ4&iflsig=ABILxe8AAAAAatz-hlmpH9xQTzjtH6VYBymXqJBLpjXY&ved=0ahUKEwj_0smhnNOXAxV5zwIHHW2hPeQQ4dUDCCA&uact=5&oq=Node.js+releases&gs_lp=Egdnd3Mtd2l6IhBOb2RlLmpzIHJlbGVhc2VzSCpQAFgAcAB4AJABAJgBAKABAKoBALgBA8gBAPgBAZgCAKACAJgDAJIHAKAHALIHALgHAMIHAMgHAIAIAQ&sclient=gws-wiz&sei=ffDcat2-Hbyvi-gPgpuG-A0","chars":11047,"fit":"ask","notFound":["List the last 3 releases of Node.js with version and date"],"spent":0.0023}
- {"what":"ai links","raw":"{\"links\":[407,491,467,443,431]}"}
- {"what":"click link","n":1,"name":"Node.js Releases Node.js https://nodejs.org › previous-releases"}
- {"what":"opened page","name":"Node.js Releases Node.js https://nodejs.org › previous-releases","url":"https://nodejs.org/en/about/previous-releases","chars":12004,"fit":"fits","notFound":[],"spent":0.0072}

### Search 2: outcome **fits**, fit true, host nodejs.org. Words: "Node.js last 3 releases version date". Links chosen: ["Node.js Releases Node.js https://nodejs.org › previous-releases","Node.js endoflife.date https://endoflife.date › nodejs","Node.js Release and EOL Timeline - LTS Schedule, Active ... Hidekazu Konishi https://hidekazu-konishi.com › n..."]. Cost after: $0.0162
- {"what":"site snapshot","url":"https://www.google.com/","chars":1881,"bot":false}
- {"what":"code picked box","line":"- combobox \"Zoek\" [expanded=false] [ref=133]"}
- {"what":"ai words","raw":"{\"words\":\"Node.js last 3 releases version date\"}"}
- {"what":"results page","url":"https://www.google.com/search?q=Node.js+last+3+releases+version+date&sca_esv=5beb0b408f23f4f0&sxsrf=APpeQntA7HtJWYMPXtSABh7LGVGFw7lTJA%3A1792864398075&source=hp&ei=jvDcat2TA8yI9u8PuvP08Qg&iflsig=ABILxe8AAAAAatz-nvRX0a33lKsgvpQh3vaWLKRemvmp&ved=0ahUKEwjdks6snNOXAxVMhP0HHbo5PY4Q4dUDCCA&uact=5&oq=Node.js+last+3+releases+version+date&gs_lp=Egdnd3Mtd2l6IiROb2RlLmpzIGxhc3QgMyByZWxlYXNlcyB2ZXJzaW9uIGRhdGVIJ1AAWABwAHgAkAEAmAEAoAEAqgEAuAEDyAEA-AEBmAIAoAIAmAMAkgcAoAcAsgcAuAcAwgcAyAcAgAgB&sclient=gws-wiz&sei=lPDcapy2Ao3Ki-gPzbmUqQ8","chars":15477,"fit":"ask","notFound":["List","the last 3 releases","with version","and date"],"spent":0.0105}
- {"what":"ai links","raw":"{\"links\":[425,437,511]}"}
- {"what":"click link","n":1,"name":"Node.js Releases Node.js https://nodejs.org › previous-releases"}
- {"what":"opened page","name":"Node.js Releases Node.js https://nodejs.org › previous-releases","url":"https://nodejs.org/en/about/previous-releases","chars":12004,"fit":"fits","notFound":[],"spent":0.0162}

## Case 2: https://duckduckgo.com x "List the last 3 releases of Node.js with version and date"

### Search 1: outcome **fits**, fit true, host nodejs.org. Words: "Node.js releases". Links chosen: ["https://nodejs.org › en › about › previous-releases","https://github.com › nodejs › node › releases","https://versionlog.com › nodejs"]. Cost after: $0.0263
- {"what":"site snapshot","url":"https://duckduckgo.com/","chars":11374,"bot":false}
- {"what":"code picked box","line":"- combobox \"Search with DuckDuckGo\" [expanded=false, required] [ref=1446]"}
- {"what":"ai words","raw":"{\"words\":\"Node.js releases\"}"}
- {"what":"results page","url":"https://duckduckgo.com/?ia=web&origin=funnel_home_website&t=h_&q=Node.js+releases","chars":19566,"fit":"ask","notFound":["last 3 releases of Node.js"],"spent":0.02}
- {"what":"ai links","raw":"{\"links\":[368,413,499]}"}
- {"what":"click link","n":1,"name":"https://nodejs.org › en › about › previous-releases"}
- {"what":"opened page","name":"https://nodejs.org › en › about › previous-releases","url":"https://nodejs.org/en/about/previous-releases","chars":12004,"fit":"fits","notFound":[],"spent":0.0263}

### Search 2: outcome **fits**, fit true, host github.com. Words: "Node.js releases". Links chosen: ["Search domain nodejs.org","https://github.com › nodejs › node › releases","https://versionlog.com › nodejs"]. Cost after: $0.0754
- {"what":"site snapshot","url":"https://duckduckgo.com/","chars":11374,"bot":false}
- {"what":"code picked box","line":"- combobox \"Search with DuckDuckGo\" [expanded=false, required] [ref=1446]"}
- {"what":"ai words","raw":"{\"words\":\"Node.js releases\"}"}
- {"what":"results page","url":"https://duckduckgo.com/?ia=web&origin=funnel_home_website&t=h_&q=Node.js+releases","chars":19469,"fit":"ask","notFound":["List the last 3 releases","version","date"],"spent":0.0302}
- {"what":"ai links","raw":"{\"links\":[365,413,506]}"}
- {"what":"click link","n":1,"name":"Search domain nodejs.org"}
- {"what":"opened page","name":"Search domain nodejs.org","url":"https://duckduckgo.com/?q=Node.js+releases+site%3Anodejs.org&t=h_&ia=web","chars":15681,"fit":"ask","notFound":["last 3 releases","Node.js","with version","and date"],"spent":0.0368}
- {"what":"click link","n":2,"name":"https://github.com › nodejs › node › releases"}
- {"what":"opened page","name":"https://github.com › nodejs › node › releases","url":"https://github.com/nodejs/node/releases","chars":189018,"fit":"fits","notFound":[],"spent":0.0754}

## Case 3: https://duckduckgo.com x "List the last 3 releases of Python with version and release date"

### Search 1: outcome **fits**, fit true, host www.python.org. Words: "Python release history". Links chosen: ["https://www.python.org › download › releases","https://www.python.org › doc › versions","https://docs.python.org › 3 › whatsnew › changelog.html","https://www.python.org › downloads › ?keys=python release history"]. Cost after: $0.1587
- {"what":"site snapshot","url":"https://duckduckgo.com/","chars":11374,"bot":false}
- {"what":"code picked box","line":"- combobox \"Search with DuckDuckGo\" [expanded=false, required] [ref=1446]"}
- {"what":"ai words","raw":"{\"words\":\"Python release history\"}"}
- {"what":"results page","url":"https://duckduckgo.com/?ia=web&origin=funnel_home_website&t=h_&q=Python+release+history","chars":21669,"fit":"ask","notFound":["List the last 3 releases of Python","with version","release date"],"spent":0.0796}
- {"what":"ai links","raw":"{\"links\":[448,415,364,536,513]}"}
- {"what":"link dropped","ref":"364","why":"not a link in snapshot"}
- {"what":"click link","n":1,"name":"https://www.python.org › download › releases"}
- {"what":"opened page","name":"https://www.python.org › download › releases","url":"https://www.python.org/download/releases/","chars":11555,"fit":"ask","notFound":["last 3 releases of Python","version","release date"],"spent":0.0859}
- {"what":"click link","n":2,"name":"https://www.python.org › doc › versions"}
- {"what":"opened page","name":"https://www.python.org › doc › versions","url":"https://www.python.org/doc/versions/","chars":63801,"fit":"ask","notFound":["last 3 releases of Python"],"spent":0.0997}
- {"what":"click link","n":3,"name":"https://docs.python.org › 3 › whatsnew › changelog.html"}
- {"what":"opened page","name":"https://docs.python.org › 3 › whatsnew › changelog.html","url":"https://docs.python.org/3/whatsnew/changelog.html","chars":196001,"fit":"ask","notFound":["last 3 releases of Python with version and release date"],"spent":0.1352}
- {"what":"click link","n":4,"name":"https://www.python.org › downloads › ?keys=python release history"}
- {"what":"opened page","name":"https://www.python.org › downloads › ?keys=python release history","url":"https://www.python.org/downloads/?keys=python%20release%20history","chars":112087,"fit":"fits","notFound":[],"spent":0.1587}

### Search 2: outcome **ask**, fit false, host null. Words: "Python release history versions dates". Links chosen: []. Cost after: $0.1667
notFound split (reported only): instruction ["last","3","of"]; data ["releases","python","python","version","release","date"]
- {"what":"site snapshot","url":"https://duckduckgo.com/","chars":11374,"bot":false}
- {"what":"code picked box","line":"- combobox \"Search with DuckDuckGo\" [expanded=false, required] [ref=1446]"}
- {"what":"ai words","raw":"{\"words\":\"Python release history versions dates\"}"}
- {"what":"results page","url":"https://duckduckgo.com/?ia=web&origin=funnel_home_website&t=h_&q=Python+release+history+versions+dates","chars":20819,"fit":"ask","notFound":["last 3 releases of Python","Python","version","release date"],"spent":0.1628}
- {"what":"ai links","raw":"{\"links\":[205,206,209]}"}
- {"what":"link dropped","ref":"205","why":"not a link in snapshot"}
- {"what":"link dropped","ref":"206","why":"not a link in snapshot"}
- {"what":"link dropped","ref":"209","why":"not a link in snapshot"}

## Case 4: https://www.google.com x "Give the population of Portugal with the year of the figure"

### Search 1: outcome **fits**, fit true, host en.wikipedia.org. Words: "population of Portugal". Links chosen: ["Portugal Wikipedia https://en.wikipedia.org › wiki","Portugal Population (2026) Worldometer https://www.worldometers.info › ...","Statistics Portugal - Press Release 770295679 Portal do INE https://www.ine.pt › xmain","Total population of Portugal 1980-2031 Statista https://www.statista.com › statistics","Portugal's population hits 11.4 million as foreigners now ... Portugal Resident https://www.portugalresident.com › ..."]. Cost after: $0.3342
- {"what":"site snapshot","url":"https://www.google.com/","chars":1881,"bot":false}
- {"what":"code picked box","line":"- combobox \"Zoek\" [expanded=false] [ref=133]"}
- {"what":"ai words","raw":"{\"words\":\"population of Portugal\"}"}
- {"what":"results page","url":"https://www.google.com/search?q=population+of+Portugal&sca_esv=5beb0b408f23f4f0&sxsrf=APpeQnvx1vXz4grayqrI6IKgPB7e9D3kAw%3A1792864688610&source=hp&ei=sPHcauXZI7_g7_UP4ZLG4Ak&iflsig=ABILxe8AAAAAatz_wCgvOPQw59_jsZknnzJNmaP3daGQ&ved=0ahUKEwjl8ZK3ndOXAxU_8LsIHWGJEZwQ4dUDCCA&uact=5&oq=population+of+Portugal&gs_lp=Egdnd3Mtd2l6IhZwb3B1bGF0aW9uIG9mIFBvcnR1Z2FsSAxQAFgAcAB4AJABAJgBAKABAKoBALgBA8gBAPgBAZgCAKACAJgDAJIHAKAHALIHALgHAMIHAMgHAIAIAQ&sclient=gws-wiz&sei=tfHcav30D_fo7_UPjfPRmQU","chars":12824,"fit":"ask","notFound":["the year of the figure"],"spent":0.1693}
- {"what":"ai links","raw":"{\"links\":[449,473,497,533,557]}"}
- {"what":"click link","n":1,"name":"Portugal Wikipedia https://en.wikipedia.org › wiki"}
- {"what":"opened page","name":"Portugal Wikipedia https://en.wikipedia.org › wiki","url":"https://en.wikipedia.org/wiki/Portugal","chars":927780,"fit":"fits","notFound":[],"spent":0.3342}

### Search 2: outcome **fits**, fit true, host worldpopulationreview.com. Words: "Portugal population". Links chosen: ["Statistics Portugal - Press Release 770295679 Portal do INE https://www.ine.pt › xmain","Portugal Population 2026 World Population Review https://worldpopulationreview.com › ...","Total population of Portugal 1980-2031 Statista https://www.statista.com › statistics","Demographics of Portugal Wikipedia https://en.wikipedia.org › wiki","Portugal Population (1950-2026) Macrotrends https://www.macrotrends.net › prt"]. Cost after: $0.3446
- {"what":"site snapshot","url":"https://www.google.com/","chars":2047,"bot":false}
- {"what":"code picked box","line":"- combobox \"Zoek\" [expanded=false] [ref=144]"}
- {"what":"ai words","raw":"{\"words\":\"Portugal population\"}"}
- {"what":"results page","url":"https://www.google.com/search?q=Portugal+population&sca_esv=5beb0b408f23f4f0&sxsrf=APpeQnt5ZEwLpoiUkay1nPx6p7RgwCQ4gw%3A1792864710641&source=hp&ei=xvHcatDbJd6Wi-gP2ZXv2Ao&iflsig=ABILxe8AAAAAatz_1gmE_0Kw8jFHPBdyU7g4Q_3vuk-r&ved=0ahUKEwjQ1tPBndOXAxVeywIHHdnKG6sQ4dUDCCA&uact=5&oq=Portugal+population&gs_lp=Egdnd3Mtd2l6IhNQb3J0dWdhbCBwb3B1bGF0aW9uSApQAFgAcAB4AJABAJgBAKABAKoBALABALgBA8gBAPgBAZgCAKACAJgDAOIDBBgAIF3iAwQYACBe4gMEGAAgX-IDBBgAIGDiAwQYACBh4gMEGAAgYpIHAKAHALIHALgHAMIHAMgHAIAIAQ&sclient=gws-wiz&sei=y_Hcap3dFKO2i-gPj6iX4Qg","chars":15036,"fit":"ask","notFound":["year of the figure"],"spent":0.3372}
- {"what":"ai links","raw":"{\"links\":[521,533,545,507,495]}"}
- {"what":"click link","n":1,"name":"Statistics Portugal - Press Release 770295679 Portal do INE https://www.ine.pt › xmain"}
- {"what":"opened page","name":"Statistics Portugal - Press Release 770295679 Portal do INE https://www.ine.pt › xmain","url":"https://www-ine-pt.translate.goog/xportal/xmain?xpid=INE&xpgid=ine_destaques&DESTAQUESdest_boui=770295679&DESTAQUESmodo=2&_x_tr_sl=en&_x_tr_tl=nl&_x_tr_hl=nl&_x_tr_pto=sc","chars":4619,"fit":"ask","notFound":["population of Portugal","the year of the figure"],"spent":0.3413}
- {"what":"click link","n":2,"name":"Portugal Population 2026 World Population Review https://worldpopulationreview.com › ..."}
- {"what":"opened page","name":"Portugal Population 2026 World Population Review https://worldpopulationreview.com › ...","url":"https://worldpopulationreview.com/countries/portugal","chars":15203,"fit":"fits","notFound":[],"spent":0.3446}

## Case 5: https://duckduckgo.com x "List the 3 tallest buildings in the world with their height in meters"

### Search 1: outcome **cap**, fit false, host null. Words: "3 tallest buildings in the world height meters". Links chosen: ["Search domain en.wikipedia.org","https://en.wikipedia.org › wiki › List_of_tallest_buildings","Search domain meterstofeet.com","https://meterstofeet.com › guides › worlds-tallest-buildings-meters-feet","Search domain en.wikipedia.org"]. Cost after: $0.3575
notFound split (reported only): instruction ["list","the","3","in","the","their","in"]; data ["tallest","buildings","world","height","meters"]
- {"what":"site snapshot","url":"https://duckduckgo.com/","chars":11374,"bot":false}
- {"what":"code picked box","line":"- combobox \"Search with DuckDuckGo\" [expanded=false, required] [ref=1446]"}
- {"what":"ai words","raw":"{\"words\":\"3 tallest buildings in the world height meters\"}"}
- {"what":"results page","url":"https://duckduckgo.com/?ia=web&origin=funnel_home_website&t=h_&q=3+tallest+buildings+in+the+world+height+meters","chars":23592,"fit":"ask","notFound":["List the 3 tallest buildings in the world","their height in meters"],"spent":0.3492}
- {"what":"ai links","raw":"{\"links\":[370,373,399,402,436]}"}
- {"what":"click link","n":1,"name":"Search domain en.wikipedia.org"}
- {"what":"opened page","name":"Search domain en.wikipedia.org","url":"https://duckduckgo.com/?q=3+tallest+buildings+in+the+world+height+meters+site%3Aen.wikipedia.org&t=h_&ia=web","chars":20383,"fit":"ask","notFound":["3 tallest buildings in the world","height in meters"],"spent":0.3575}
- {"what":"click link","n":2,"name":"https://en.wikipedia.org › wiki › List_of_tallest_buildings"}
- {"what":"opened page","name":"https://en.wikipedia.org › wiki › List_of_tallest_buildings","url":"https://en.wikipedia.org/wiki/List_of_tallest_buildings","chars":336054,"fit":"cap","spent":0.3575}

### Search 2: outcome **cap**, fit false, host null. Words: "3 tallest buildings in the world height in meters". Links chosen: ["https://en.wikipedia.org › wiki › List_of_tallest_buildings","https://meterstofeet.com › guides › worlds-tallest-buildings-meters-feet","https://en.wikipedia.org › wiki › List_of_tallest_structures","https://www.size-explorer.com › en › topranking › buildings","https://archeyes.com › tallest-buildings-in-the-world"]. Cost after: $0.3665
notFound split (reported only): instruction ["list","the","3","in","the","with","their","in"]; data ["tallest","buildings","world","height","meters"]
- {"what":"site snapshot","url":"https://duckduckgo.com/","chars":11374,"bot":false}
- {"what":"code picked box","line":"- combobox \"Search with DuckDuckGo\" [expanded=false, required] [ref=1446]"}
- {"what":"ai words","raw":"{\"words\":\"3 tallest buildings in the world height in meters\"}"}
- {"what":"results page","url":"https://duckduckgo.com/?ia=web&origin=funnel_home_website&t=h_&q=3+tallest+buildings+in+the+world+height+in+meters","chars":23615,"fit":"ask","notFound":["List the 3 tallest buildings in the world","with their height in meters"],"spent":0.3621}
- {"what":"ai links","raw":"{\"links\":[373,410,447,524,550]}"}
- {"what":"click link","n":1,"name":"https://en.wikipedia.org › wiki › List_of_tallest_buildings"}
- {"what":"opened page","name":"https://en.wikipedia.org › wiki › List_of_tallest_buildings","url":"https://en.wikipedia.org/wiki/List_of_tallest_buildings","chars":336095,"fit":"cap","spent":0.3665}

## Case 6: https://www.google.com x "List the last 3 releases of Firefox with version and release date"

### Search 1: outcome **fits**, fit true, host www.google.com. Words: "Firefox release notes version release date". Links chosen: []. Cost after: $0.3695
- {"what":"site snapshot","url":"https://www.google.com/","chars":2065,"bot":false}
- {"what":"code picked box","line":"- combobox \"Zoek\" [expanded=false] [ref=150]"}
- {"what":"ai words","raw":"{\"words\":\"Firefox release notes version release date\"}"}
- {"what":"results page","url":"https://www.google.com/search?q=Firefox+release+notes+version+release+date&sca_esv=5beb0b408f23f4f0&sxsrf=APpeQnv9NpBm9fuNuCPqbFAgL-OTXCC0_g%3A1792864843881&source=hp&ei=S_Lcapm9NOqK9u8P0JaQ6AQ&iflsig=ABILxe8AAAAAat0AW9f-d5-vHDjPoK71IEGgCtGkMdy3&ved=0ahUKEwjZjpiBntOXAxVqhf0HHVALBE0Q4dUDCB4&uact=5&oq=Firefox+release+notes+version+release+date&gs_lp=Egdnd3Mtd2l6IipGaXJlZm94IHJlbGVhc2Ugbm90ZXMgdmVyc2lvbiByZWxlYXNlIGRhdGVIB1AAWABwAHgAkAEAmAEAoAEAqgEAsAEAuAEDyAEA-AEBmAIAoAIAmAMA4gMEGAAgXeIDBBgAIF7iAwQYACBf4gMEGAAgYOIDBBgAIGHiAwQYACBikgcAoAcAsgcAuAcAwgcAyAcAgAgB&sclient=gws-wiz&sei=UPLcatTbOv-O9u8PpriL-Aw","chars":14577,"fit":"fits","notFound":[],"spent":0.3695}

### Search 2: outcome **cap**, fit false, host null. Words: "Firefox release history versions dates". Links chosen: ["Firefox version history Wikipedia https://en.wikipedia.org › wiki › F...","Firefox Release Notes Firefox https://www.firefox.com › releases","Firefox Release Calendar - MozillaWiki mozilla.org https://wiki.mozilla.org › Calendar","Firefox Release Calendar whattrainisitnow.com https://whattrainisitnow.com › cal...","Firefox endoflife.date https://endoflife.date › firefox"]. Cost after: $0.3751
notFound split (reported only): instruction ["last","3","of"]; data ["releases","firefox","version","release","date"]
- {"what":"site snapshot","url":"https://www.google.com/","chars":2067,"bot":false}
- {"what":"code picked box","line":"- combobox \"Zoek\" [expanded=false] [ref=152]"}
- {"what":"ai words","raw":"{\"words\":\"Firefox release history versions dates\"}"}
- {"what":"results page","url":"https://www.google.com/search?q=Firefox+release+history+versions+dates&sca_esv=5beb0b408f23f4f0&sxsrf=APpeQnsrxZVESr3hwHKThZY1Gv9yzhHxDg%3A1792864855161&source=hp&ei=V_Lcap-xCLyWi-gP8dW4yQQ&iflsig=ABILxe8AAAAAat0AZ1TP4kde9TyhDoRS1oce0uOxdYSz&ved=0ahUKEwjfuMiGntOXAxU8ywIHHfEqLkkQ4dUDCCE&uact=5&oq=Firefox+release+history+versions+dates&gs_lp=Egdnd3Mtd2l6IiZGaXJlZm94IHJlbGVhc2UgaGlzdG9yeSB2ZXJzaW9ucyBkYXRlc0gJUABYAHAAeACQAQCYAQCgAQCqAQCwAQC4AQPIAQD4AQGYAgCgAgCYAwDiAwQYACBd4gMEGAAgXuIDBBgAIF_iAwQYACBg4gMEGAAgYeIDBBgAIGKSBwCgBwCyBwC4BwDCBwDIBwCACAE&sclient=gws-wiz&sei=XPLcardl__iL6A_RpMH5BQ","chars":14044,"fit":"ask","notFound":["last 3 releases of Firefox","version","release date"],"spent":0.3724}
- {"what":"ai links","raw":"{\"links\":[451,467,479,491,547]}"}
- {"what":"click link","n":1,"name":"Firefox version history Wikipedia https://en.wikipedia.org › wiki › F..."}
- {"what":"opened page","name":"Firefox version history Wikipedia https://en.wikipedia.org › wiki › F...","url":"https://en.wikipedia.org/wiki/Firefox_version_history","chars":374612,"fit":"cap","spent":0.3751}
