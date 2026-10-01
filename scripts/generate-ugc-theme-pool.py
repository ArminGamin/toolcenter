#!/usr/bin/env python3
"""Generate UGC Slides theme pool (~600 HOOK/BODY sets for tavoknyga.com)."""

from __future__ import annotations

import json
import re
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets" / "ugc-slides" / "theme_pool.json"

# Each entry: (theme_en, hook_lt, body_lt)
# Hooks: 2-5 words LT. Bodies: <=30 words, must mention "Tavo knyga", concrete mechanic.

POOL: dict[str, list[tuple[str, str, str]]] = {}

def e(theme: str, hook: str, body: str) -> tuple[str, str, str]:
    return (theme, hook, body)

# ── Body & weight goals ──────────────────────────────────────────────────────
POOL["Body & weight goals"] = [
    e("sustainable weight loss", "Sveikesnės porcijos", '"Tavo knyga" sudaro asmeninį savaitės planą su tiksliais porcijomis, kad valgytum sotiai, bet neper daug kiekvieną dieną.'),
    e("losing weight without strict dieting", "Be griežtų dietų", 'Po 30 klausimų testo "Tavo knyga" parenka receptus pagal tavo tikslus, o ne vieną universalų meniu visiems.'),
    e("portion control made simple", "Aiškios porcijos", 'Kiekvienam patiekalui planas nurodo kiekius ir pirkinių sąrašą, todėl nereikia spėlioti, kiek valgyti vakarienei.'),
    e("stopping yo-yo dieting", "Baik svorio kalnelį", 'Naudoju "Tavo knyga", ir nebegrįžtu prie chaotiško valgymo, nes turiu savaitės planą, o ne impulsyvius sprendimus.'),
    e("eating enough while cutting", "Valgyk pakankamai", '"Tavo knyga" subalansuoja patiekalus pagal tavo duomenis, kad mažintum svorį nebadaujant ir neprarandant energijos.'),
    e("weekend weight sabotage", "Savaitgaliai be griūties", 'Penktadienį jau žinai savaitgalio patiekalus ir pirkinius, todėl lengviau laikytis plano, o ne valgyti viską po ranka.'),
    e("late night snacking", "Vakariniai užkandžiai", 'Planas įtraukia sotinančius vakarienės variantus pagal tavo rutiną, kad mažiau temptų impulsyviai užkandžiauti.'),
    e("scale frustration", "Mažiau svarstyklių streso", '"Tavo knyga" fokusuoja į įpročius ir planą, o ne į vienos dienos svorio šuolius, kuriuos sunku kontroliuoti.'),
    e("belly fat concerns", "Sveikesnis pilvas", 'Asmeninis planas renka patiekalus pagal tavo tikslus ir pageidavimus, o ne bendrus patarimus iš socialinių tinklų.'),
    e("slow metabolism worries", "Ramesnis metabolizmas", 'Reguliarus savaitės planas su aiškiais patiekalais padeda valgyti pastoviau, o ne šokinėti tarp dietų.'),
    e("post-holiday reset", "Po švenčių lengviau", 'Ingredientai suplanuoti keliems patiekalams, todėl po švenčių greičiau grįžti prie įprasto ritmo be perteklinių pirkinių.'),
    e("mindless eating", "Sąmoningesnis valgymas", 'Kai žinai, ką gaminsi kiekvieną vakarą, mažiau valgai automatiškai, nes sprendimai jau priimti iš anksto.'),
    e("weight loss plateaus", "Kai svoris stovi", '"Tavo knyga" atnaujina planą pagal tavo atsakymus, kad meniu atitiktų dabartinį etapą, o ne praeities dietą.'),
    e("healthy weight maintenance", "Išlaikyk svorį", 'Vienas asmeninis planas veikia kas savaitę, todėl lengviau išlaikyti rezultatą be nuolatinio naujo meniu galvojimo.'),
    e("emotional overeating triggers", "Mažiau emocinio valgymo", 'Struktūruotas savaitės planas sumažina sprendimų nuovargį, kai norisi valgyti dėl streso, o ne alkio.'),
    e("skipping meals habit", "Nebepraleisk valgymų", 'Planas paskirsto patiekalus per dieną pagal tavo grafiką, kad nepraleistum valgymų ir vėliau nepersivalgytum.'),
    e("hidden calories in sauces", "Mažiau paslėptų kalorijų", 'Receptai su aiškiais ingredientais ir kiekiais, todėl lengviau matyti, ką tikrai valgai kiekvieną dieną.'),
    e("eating out too often", "Mažiau valgymo išėjus", 'Namų patiekalų planas su pirkinių sąrašu padeda dažniau gaminti, kai žinai tikslų savaitės meniu.'),
    e("sugar cravings weight link", "Mažiau cukraus šuolių", '"Tavo knyga" parenka patiekalus pagal tavo pageidavimus, kad mažiau temptų saldūs impulsyvūs užkandžiai.'),
    e("consistent breakfast habit", "Stabilus pusrytis", 'Rytas įtrauktas į savaitės planą su konkrečiais receptais, todėl nebereikia ryte galvoti, ką greitai suvalgyti.'),
    e("water weight confusion", "Aiškesnis progresas", 'Fokusas į įpročius ir planą, o ne į kasdienius svorio svyravimus, kuriuos lengva klaidingai interpretuoti.'),
    e("family meals while dieting", "Šeimos stalas ir tikslai", 'Planas gali atsižvelgti į tavo duomenis ir namų rutiną, kad valgytum kartu, bet pagal savo porcijas.'),
    e("afternoon energy slump eating", "Popietė be persivalgymo", 'Sotūs pietūs ir užkandžiai suplanuoti pagal tavo dieną, kad energija būtų stabilesnė iki vakaro.'),
    e("weighing food obsession", "Be svarstyklių manijos", 'Porcijos jau suplanuotos receptuose, todėl nereikia sverti kiekvieno kąsnio atskirai.'),
    e("starting weight loss again", "Nauja pradžia paprasčiau", '30 klausimų testas greitai suformuoja planą pagal dabartinę situaciją, o ne seną šabloną iš interneto.'),
    e("clothes fitting goals", "Drabužiai vėl tinka", 'Asmeninis savaitės meniu padeda laikytis krypties, kai tikslas ne skaičius, o jausmas kūne.'),
    e("vacation weight fear", "Atostogos be panikos", 'Iš anksto suplanuoti patiekalai ir pirkinių sąrašai padeda išlaikyti rutiną grįžus namo.'),
    e("night shift weight gain", "Naktinis grafikas", 'Planas pritaikomas pagal tavo miego ir darbo ritmą, o ne standartinį dienos meniu.'),
    e("menopause weight changes", "Kūno pokyčiai ramiau", '"Tavo knyga" atnaujina receptus pagal tavo atsakymus, kai keičiasi poreikiai ir energija.'),
    e("teen family member nutrition", "Augantis organizmas", 'Asmeninis planas gali atsižvelgti į amžių ir tikslus, o ne vieną šeimos meniu visiems.'),
    e("post-injury weight management", "Po traumos atsigavimas", 'Patiekalai parenkami pagal tavo ribojimus ir tikslus, kad mityba būtų struktūruota atkūrimo metu.'),
    e("desk job weight gain", "Sėdimas darbas", 'Greiti pietūs ir sotūs patiekalai suplanuoti pagal trumpas pertraukas, o ne greitą užkandį.'),
    e("stress eating at work", "Stresas darbe", 'Aiškus savaitės planas sumažina impulsą valgyti saldumynus, kai diena išsekina.'),
    e("healthy snacks at home", "Sveiki užkandžiai", 'Pirkinių sąraše tik tai, kas tinka planui, todėl namuose mažiau atsitiktinių kaloringų užkandžių.'),
    e("meal timing for weight", "Valgymo laikas", 'Patiekalai paskirstyti per dieną pagal tavo rutiną, kad energija būtų pastovesnė.'),
    e("fiber for satiety", "Sotesnis maistas", 'Receptai parinkti taip, kad valgytum sotiai su įprastais produktais, o ne nuolat badautum.'),
    e("protein at every meal", "Balansas kiekviename", 'Kiekvienam patiekalui planas suderina ingredientus pagal tavo tikslus ir skonį.'),
    e("reducing processed foods", "Mažiau pusgaminių", 'Savaitės receptai iš aiškių ingredientų, todėl lengviau mažinti perdirbtą maistą kasdien.'),
    e("batch cooking for weight", "Vienu kartu savaitei", 'Ingredientai naudojami keliuose patiekaluose, kad paruoštum dalį maisto iš anksto be pertekliaus.'),
    e("social events eating", "Renginiai be kaltės", 'Planas padeda išlaikyti struktūrą aplink savaitę, kai viena diena nukrypsta nuo rutinos.'),
    e("tracking without apps", "Be sudėtingų programėlių", '"Tavo knyga" duoda paprastą savaitės planą ir sąrašus, o ne dar vieną skaičiavimo sistemą.'),
]

# ── Health conditions (diet-managed) ─────────────────────────────────────────
POOL["Health conditions"] = [
    e("type 2 diabetes friendly meals", "Cukraus kontrolė", '"Tavo knyga" parenka patiekalus pagal tavo atsakymus, kad planas atitiktų tavo mitybos poreikius be spėliojimo.'),
    e("prediabetes prevention diet", "Prieš diabetą", 'Asmeninis savaitės planas padeda valgyti pastoviau, kai norisi mažinti cukraus šuolius kasdien.'),
    e("high cholesterol eating plan", "Mažesnis cholesterolis", 'Receptai su aiškiais ingredientais ir porcijomis, kad lengviau laikytis gydytojo rekomenduojamos krypties.'),
    e("PCOS friendly nutrition", "PCOS ir maistas", 'Po testo planas atsižvelgia į tavo tikslus ir pageidavimus, o ne bendrą moterų dietą iš forumų.'),
    e("IBS trigger management", "Jautrus virškinimas", '"Tavo knyga" gali išskirti nemėgstamus produktus, kad receptai netrikdytų virškinimo kasdien.'),
    e("low FODMAP planning", "FODMAP planas", 'Savaitės meniu su konkrečiais ingredientais padeda vengti žinomų triggerių be nuolatinio sąrašų tikrinimo.'),
    e("thyroid and nutrition", "Skydliaukė ir maistas", 'Asmeninis planas pritaikomas pagal tavo duomenis, kai reikia stabilesnės kasdienės mitybos struktūros.'),
    e("celiac gluten-free meals", "Be gliadino", 'Receptai parenkami pagal tavo apribojimus, o pirkinių sąrašas sumažina riziką netyčia nusipirkti netinkamų produktų.'),
    e("lactose intolerance meals", "Be laktozės", '"Tavo knyga" atsižvelgia į netoleruojamus produktus, kad nereikėtų kiekvieną receptą taisyti ranka.'),
    e("nut allergy safe cooking", "Saugūs receptai", 'Planas vengia nurodytų alergenų ir duoda aiškų ingredientų sąrašą kiekvienam patiekalui.'),
    e("egg allergy alternatives", "Be kiaušinių", 'Asmeninis meniu parenkamas be kiaušinių, bet su įprastais produktais iš parduotuvės.'),
    e("histamine intolerance diet", "Mažiau histamino", 'Savaitės patiekalai suplanuoti su aiškiais ingredientais, kad lengviau sekti, kas tinka tau.'),
    e("gout friendly eating", "Podagros dieta", 'Receptai ir porcijos suderinti pagal tavo tikslus, kai reikia vengti tam tikrų produktų grupių.'),
    e("kidney-friendly low sodium", "Mažiau druskos", '"Tavo knyga" padeda planuoti patiekalus su aiškiais ingredientais, kai svarbu kontroliuoti druską.'),
    e("heart healthy mediterranean tilt", "Širdžiai draugiška", 'Asmeninis planas renka patiekalus pagal tavo pageidavimus ir tikslus, o ne vieną šabloninį meniu.'),
    e("fatty liver diet support", "Kepenų sveikata", 'Struktūruotas savaitės planas padeda valgyti pastoviau, kai reikia mažiau chaotiškų sprendimų.'),
    e("anemia iron-rich meals", "Daugiau geležies", 'Receptai parenkami pagal tavo duomenis, kad į planą patektų tinkami patiekalų variantai.'),
    e("osteoporosis calcium focus", "Kaulams svarbu", 'Savaitės meniu su konkrečiais ingredientais padeda įtraukti reikalingas maistines medžiagas kasdien.'),
    e("endometriosis inflammation diet", "Mažiau uždegimo", '"Tavo knyga" atsižvelgia į tavo apribojimus ir tikslus, kai kūnas jautrus tam tikriems produktams.'),
    e("autoimmune protocol lite", "Autoimuninė kasdienybė", 'Asmeninis planas sumažina spėliojimą, ką gaminti, kai reikia vengti daugelio ingredientų.'),
    e("GERD acid reflux meals", "Ramesnis skrandis", 'Patiekalai parinkti pagal tavo pageidavimus, kad vakarienė mažiau trikdytų miegodama.'),
    e("diverticulitis gentle foods", "Švelnus virškinimas", 'Savaitės receptai su aiškiais ingredientais, kai reikia atsargesnio meniu laikotarpiu.'),
    e("gestational diabetes meals", "Nėštumo cukrus", 'Planas pritaikomas pagal tavo atsakymus, kai reikia stabilesnės mitybos struktūros.'),
    e("insulin resistance eating", "Insulino jautrumas", 'Asmeninis meniu padeda valgyti pastoviau per dieną, o ne chaotiškai reaguoti į alkio šuolius.'),
    e("metabolic syndrome lifestyle", "Metabolinė sveikata", '"Tavo knyga" duoda savaitės planą ir pirkinių sąrašus, kad mažiau impulsinių sprendimų kasdien.'),
    e("chronic fatigue nutrition", "Daugiau energijos", 'Patiekalai suplanuoti pagal tavo rutiną, kad mažiau jėgų skirtum sprendimams, ką valgyti.'),
    e("migraine food triggers", "Mažiau migrenų", 'Ingredientai kontroliuojami per planą, kad lengviau vengti žinomų triggerių produktų.'),
    e("eczema and diet connection", "Oda ir maistas", 'Asmeninis planas atsižvelgia į tavo pageidavimus, kai norisi stebėti, kaip maistas veikia savijautą.'),
    e("arthritis anti-inflammatory tilt", "Sąnariams lengviau", 'Savaitės meniu su aiškiais receptais padeda laikytis pastovesnės mitybos krypties.'),
    e("blood pressure DASH style", "Kraujo spaudimas", 'Receptai ir porcijos suplanuoti pagal tavo duomenis, o ne bendrus patarimus iš straipsnių.'),
    e("Crohns flare planning", "Krono kasdienybė", '"Tavo knyga" leidžia pritaikyti meniu pagal tavo apribojimus, kai virškinimas jautrus.'),
    e("ulcerative colitis meals", "Švelnus meniu", 'Asmeninis planas sumažina stresą renkantis patiekalus, kai reikia atsargumo su ingredientais.'),
    e("SIBO friendly rotation", "SIBO planas", 'Savaitės patiekalai su aiškiais produktais padeda vengti pasikartojančių triggerių.'),
    e("non-celiac gluten sensitivity", "Jautrumas gliadinui", 'Receptai be gliadino parenkami pagal tavo atsakymus, o sąrašas apsaugo nuo klaidų parduotuvėje.'),
    e("oral allergy syndrome foods", "Sezoniniai alergenai", 'Planas gali atsižvelgti į tavo ribojimus, kad receptai atitiktų tai, ką gali valgyti.'),
    e("diabetes and weight together", "Cukrus ir svoris", '"Tavo knyga" sujungia tavo tikslus viename savaitės plane, o ne atskiruose patarimuose.'),
    e("cholesterol and family meals", "Šeima ir cholesterolis", 'Asmeninės porcijos ir receptai pagal tavo duomenis, net kai gamini kitiems namuose.'),
    e("PCOS and sugar cravings", "PCOS ir saldumynai", 'Planas parenka patiekalus pagal tavo pageidavimus, kad mažiau temptų impulsyvūs saldūs užkandžiai.'),
    e("IBS and eating out anxiety", "IBS ir restoranai", 'Namų planas su aiškiais ingredientais padeda dažniau valgyti kontroliuojamoje aplinkoje.'),
    e("thyroid and weight struggles", "Skydliaukė ir svoris", 'Asmeninis meniu atnaujinamas pagal tavo atsakymus, kai keičiasi poreikiai.'),
    e("multiple food intolerances", "Keli apribojimai", '"Tavo knyga" filtruoja ingredientus pagal tavo duomenis, o ne reikalauja ranka kurti meniu.'),
    e("post-surgery soft diet transition", "Po operacijos", 'Planas pritaikomas pagal tavo situaciją, kai reikia švelnesnio perėjimo prie įprasto valgymo.'),
    e("medication food interactions awareness", "Vaistai ir maistas", 'Aiškūs receptai ir ingredientai padeda lengviau derinti mitybą su gydytojo rekomendacijomis.'),
    e("chronic inflammation reduction", "Mažiau uždegimo", 'Savaitės struktūra padeda valgyti pastoviau, kai norisi mažiau chaotiškų sprendimų.'),
    e("hormone balance through food", "Hormonų balansas", 'Asmeninis planas atsižvelgia į tavo tikslus, o ne bendrą hormonų dietą iš reklamų.'),
    e("blood sugar morning stability", "Rytinis cukrus", 'Pusryčiai suplanuoti konkrečiais receptais, kad diena prasidėtų stabiliau.'),
    e("neuropathy nutrition support", "Nervų sveikata", '"Tavo knyga" duoda struktūruotą savaitės planą, kai svarbu nuoseklumas, o ne eksperimentai.'),
    e("pancreatitis recovery eating", "Kasa atsigavimas", 'Receptai parinkti pagal tavo apribojimus ir tikslus atkūrimo laikotarpiu.'),
    e("gallbladder-friendly low fat", "Mažiau riebalų", 'Asmeninis meniu su aiškiais ingredientais, kai reikia lengvesnių patiekalų.'),
    e("iron deficiency meal planning", "Geležies planas", 'Savaitės receptai parenkami pagal tavo duomenis, kad įtrauktum tinkamus patiekalus.'),
    e("vitamin D and nutrition habits", "Vitamino D rutina", 'Planas padeda laikytis pastovių valgymo įpročių, o ne atsitiktinių sprendimų.'),
]

# ── Life stages & milestones ─────────────────────────────────────────────────
POOL["Life stages & milestones"] = [
    e("postpartum nutrition recovery", "Po gimdymo maistas", '"Tavo knyga" pritaiko savaitės planą pagal tavo rutiną, kai laiko mažai, o energijos reikia daug.'),
    e("breastfeeding meal support", "Žindymo metu", 'Asmeninis meniu su greitais patiekalais padeda valgyti reguliariai be ilgo planavimo.'),
    e("menopause nutrition shift", "Menopauzės etapas", 'Planas atnaujinamas pagal tavo atsakymus, kai keičiasi poreikiai ir energija kasdien.'),
    e("turning 40 health reset", "Po keturiasdešimt", '30 klausimų testas suformuoja planą pagal dabartinį etapą, o ne jaunystės dietą.'),
    e("wedding prep nutrition", "Prieš vestuves", 'Savaitės meniu ir pirkinių sąrašai padeda laikytis krypties be chaotiško badavimo.'),
    e("new year reset eating", "Nauji metai", '"Tavo knyga" duoda aiškų savaitės planą, o ne dar vieną abstraktų pažadą valgyti sveikiau.'),
    e("back to school family routine", "Rugsėjo rutina", 'Patiekalai suplanuoti pagal užimtą grafiką, kai grįžta darbas ir mokyklos.'),
    e("empty nest cooking again", "Tuščias lizdas", 'Asmeninis planas dviem ar vienam, kad nereikėtų gaminti senų šeimos porcijų.'),
    e("new parent exhaustion meals", "Nauji tėvai", 'Greiti receptai ir sąrašai padeda valgyti, kai miegas trumpas, o laiko mažai.'),
    e("retirement healthy cooking", "Po pensijos", 'Savaitės planas supaprastina sprendimus, kai norisi daugiau laiko, bet mažiau chaoso virtuvėje.'),
    e("college student budget meals", "Studentų biudžetas", 'Biudžetui draugiški receptai su tiksliais pirkinių sąrašais kiekvienai savaitei.'),
    e("first apartment cooking", "Pirmas butas", '"Tavo knyga" moko planuoti pirkinius ir patiekalus, kai virtuvė dar nauja.'),
    e("pregnancy trimester meals", "Nėštumo etapai", 'Planas pritaikomas pagal tavo atsakymus ir pageidavimus kiekvienam etapui.'),
    e("fertility nutrition focus", "Vaisingumo rutina", 'Asmeninis meniu padeda valgyti pastoviau, kai svarbi kasdienė struktūra.'),
    e("divorce fresh start cooking", "Naujas etapas", 'Vienas planas tau, be senų šeimos įpročių, su aiškiais receptais.'),
    e("moving homes meal chaos", "Perkraustymo savaitė", 'Pirkinių sąrašas ir paprasti patiekalai padeda išlaikyti rutiną judant.'),
    e("career promotion busy period", "Karjeros šuolis", 'Greiti pietūs suplanuoti pagal ilgas darbo dienas be greito maisto.'),
    e("exam season student eating", "Egzaminų laikas", 'Minimalus planavimas, maksimalus aiškumas — žinai, ką valgysi kiekvieną dieną.'),
    e("gap year travel return", "Po kelionių", 'Ingredientai suplanuoti savaitei, kad greičiau grįžtum prie namų rutinos.'),
    e("grandparent raising grandkids", "Seneliai ir vaikai", 'Planas atsižvelgia į tavo duomenis ir namų dinamiką.'),
    e("midlife health wake-up", "Vidurio gyvenimo", 'Asmeninis planas pagal tavo tikslus, kai norisi keisti įpročius ramiai.'),
    e("engagement party prep", "Prieš šventę", 'Savaitės meniu padeda laikytis plano prieš svarbius renginius.'),
    e("summer before university", "Prieš universitetą", 'Biudžetui draugiškas planas su aiškiais receptais pirmam savarankiškam etapui.'),
    e("new job long commute", "Ilgas kelias", 'Patiekalai parinkti pagal trumpą laiką, kai grįžti vėlai namo.'),
    e("recovery after burnout", "Po perdegimo", 'Struktūruotas planas sumažina sprendimų naštą, kai energijos mažai.'),
    e("first baby solids planning", "Pirmas maistas kūdikiui", 'Tavo planas atskirai, kad suaugusiųjų mityba nenukryptų dėl chaoso.'),
    e("teen leaving home soon", "Paauglys išvyksta", 'Mokai planuoti porcijas ir pirkinius, kai šeima keičiasi.'),
    e("aging parents meal support", "Globa tėvams", 'Aiškūs receptai ir sąrašai padeda gaminti be papildomo galvojimo.'),
    e("honeymoon return routine", "Po medaus mėnesio", 'Savaitės planas padeda grįžti prie įprastos rutinos be impulsyvaus valgymo.'),
    e("spring wedding countdown", "Pavasario vestuvės", 'Asmeninis meniu su konkrečiais patiekalais kiekvienai savaitei.'),
    e("autumn back to routine", "Rudens rutina", '"Tavo knyga" atnaujina planą pagal sezoną ir tavo tikslus.'),
    e("winter holiday recovery", "Po švenčių", 'Ingredientai naudojami keliuose patiekaluose, kad mažiau maisto išmestum po švenčių.'),
    e("milestone birthday reset", "Apvali sukaktis", '30 klausimų testas greitai suformuoja naują kryptį pagal dabartį.'),
    e("new relationship cooking together", "Kartu virtuvėje", 'Asmeninis planas pagal tavo duomenis, net kai gaminate poroje.'),
    e("single again meal planning", "Vėl viena", 'Porcijos ir receptai tik tau, be senų įpročių ir perteklinių pirkinių.'),
    e("relocating abroad food habits", "Gyvenimas užsienyje", 'Planas su įprastais produktais, pritaikytas tavo situacijai.'),
    e("first home dinner parties", "Vakarienės namuose", 'Savaitės struktūra palieka vietos renginiams be viso meniu griūties.'),
    e("parental leave meal prep", "Tėvystės atostogos", 'Greiti patiekalai suplanuoti pagal trumpas virtuvės pertraukas.'),
    e("menstrual cycle nutrition", "Ciklo ritmas", 'Planas atsižvelgia į tavo pageidavimus skirtingoms savaitėms.'),
    e("perimenopause energy meals", "Perimenopauzė", 'Asmeninis meniu padeda valgyti pastoviau, kai energija svyruoja.'),
    e("adult child moving out", "Vaikas išvyko", 'Mažesnės porcijos ir aiškūs pirkinių sąrašai be pertekliaus.'),
]

# ── Dietary approaches ───────────────────────────────────────────────────────
POOL["Dietary approaches"] = [
    e("keto meal planning", "Keto be spėliojimo", '"Tavo knyga" parenka patiekalus pagal tavo apribojimus ir tikslus, o sąrašas apsaugo nuo netinkamų pirkinių.'),
    e("low carb weeknight dinners", "Mažai angliavandenių", 'Savaitės meniu su aiškiais ingredientais, kad nereikėtų skaičiuoti kiekvieno patiekalo ranka.'),
    e("vegan family meals", "Veganams paprasčiau", 'Receptai be gyvulinės kilmės produktų pagal tavo atsakymus, o ne atsitiktiniai interneto radiniai.'),
    e("vegetarian high protein", "Augalinis balansas", 'Asmeninis planas sujungia tavo pageidavimus ir balansą kiekvienai dienai.'),
    e("intermittent fasting structure", "Badymo langas", 'Patiekalai paskirstyti pagal tavo rutiną, kad valgymo langas būtų aiškus.'),
    e("Mediterranean style eating", "Viduržemio stilius", '"Tavo knyga" renka patiekalus pagal tavo skonį ir tikslus, o ne vieną fiksuotą meniu.'),
    e("gluten-free family cooking", "Be gliadino šeimai", 'Asmeninis meniu atsižvelgia į apribojimus ir namų rutiną.'),
    e("dairy-free meal plan", "Be pieno produktų", 'Receptai parenkami be laktozės pagal tavo pageidavimus.'),
    e("plant-based budget meals", "Augalinis biudžetas", 'Biudžetui draugiški receptai, ingredientai naudojami keliuose patiekaluose.'),
    e("low sugar lifestyle", "Mažiau cukraus", '"Tavo knyga" parenka patiekalus pagal tavo pageidavimus be saldžių šuolių.'),
    e("high protein low fat", "Balansas ir baltymai", 'Porcijos suplanuotos receptuose pagal tavo tikslus be rankinio skaičiavimo.'),
    e("anti-inflammatory diet", "Mažiau uždegimo", 'Patiekalai parinkti pagal tavo duomenis ir apribojimus.'),
    e("grain-free meals", "Be grūdų", 'Savaitės receptai pagal tavo apribojimus ir skonį.'),
    e("macro counting alternative", "Be macro streso", 'Porcijos jau suplanuotos receptuose, o ne skaičiuojamos programėlėje.'),
    e("intuitive eating structure", "Intuityvi struktūra", 'Planas duoda ramybę, ne griežtas taisykles.'),
]

# ── Lifestyle & convenience ──────────────────────────────────────────────────
POOL["Lifestyle & convenience"] = [
    e("busy professional dinners", "Užimti vakarai", '"Tavo knyga" sudaro savaitės planą su greitais patiekalais, kai grįžti vėlai namo.'),
    e("meal prep Sunday routine", "Sekmadienio paruošimas", 'Ingredientai naudojami keliuose patiekaluose, kad dalį maisto paruoštum iš anksto.'),
    e("15 minute weeknight meals", "Penkiolika minučių", 'Receptai parinkti pagal trumpą laiką ir tavo rutiną.'),
    e("budget meals under 30 euros", "Biudžetas savaitei", 'Biudžetui draugiški receptai su tiksliais pirkinių sąrašais.'),
    e("picky eater family", "Išrankūs valgytojai", 'Planas atsižvelgia į nemėgstamus produktus ir šeimos pageidavimus.'),
    e("no time to cook", "Nėra laiko gaminti", 'Greiti patiekalai suplanuoti pagal tavo grafiką kiekvienai dienai.'),
    e("grocery list chaos", "Pirkinių chaosas", 'Tikslūs sąrašai pagal planą, o ne spėliojimas parduotuvėje.'),
    e("impulse shopping fix", "Mažiau impulsų", 'Perki tik tai, kas suplanuota receptuose.'),
    e("no recipe hunting", "Be receptų paieškos", '"Tavo knyga" duoda visą savaitės meniu vienoje vietoje.'),
    e("remote worker snack trap", "Nuotolinis darbas", 'Struktūruotas planas mažina nuolatinį užkandžiavimą.'),
    e("meal kit alternative", "Be meal kit", 'Vienkartinis planas vietoj brangių rinkinių.'),
    e("no cooking skills beginner", "Pradedantysis virtuvėje", 'Paprasti žingsniai ir aiškus savaitės meniu.'),
]

# ── Emotional & psychological ──────────────────────────────────────────────
POOL["Emotional & psychological"] = [
    e("sugar cravings control", "Mažiau saldumo", '"Tavo knyga" parenka patiekalus pagal tavo pageidavimus, kad mažiau temptų impulsyvūs saldumynai.'),
    e("emotional eating stress", "Stresinis valgymas", 'Savaitės planas sumažina sprendimų nuovargį, kai norisi valgyti dėl emocijų.'),
    e("diet burnout recovery", "Po dietų nuovargio", 'Vienas asmeninis planas vietoj nuolatinio naujo bandymo nuo nulio.'),
    e("motivation without willpower", "Be valios kovos", 'Struktūra padeda veikti, kai motyvacija svyruoja.'),
    e("food guilt cycle", "Mažiau kaltės", 'Aiškus planas leidžia valgyti ramiau be nuolatinio „blogai valgiau" jausmo.'),
    e("binge restrict cycle", "Be binge ciklo", 'Pastovus savaitės meniu padeda nutraukti badavimo ir persivalgymo ratą.'),
    e("comfort food replacement", "Komfortas kitaip", 'Sotūs patiekalai suplanuoti pagal tavo skonį be chaotiškų užkandžių.'),
    e("anxiety around food choices", "Mažiau nerimo", 'Žinai, ką valgysi kiekvieną dieną, todėl mažiau sprendimų sukelia streso.'),
    e("perfectionism in dieting", "Be tobulybės spaudimo", 'Planas leidžia laikytis krypties be „viskas arba nieko" mąstymo.'),
    e("shame after eating", "Mažiau gėdos", 'Struktūruota mityba padeda santykiui su maistu tapti ramesniam.'),
    e("reward eating habit", "Ne apdovanojimas maistu", 'Planas įtraukia sotinančius patiekalus, kad mažiau temptų saldūs prizai.'),
    e("lonely eating habits", "Vakarienė viena", 'Asmeninis meniu padeda gaminti sau, o ne užsisakyti impulsyviai.'),
]

# ── Fitness & energy ─────────────────────────────────────────────────────────
POOL["Fitness & energy"] = [
    e("muscle gain meal plan", "Raumenims augti", '"Tavo knyga" suderina porcijas ir patiekalus pagal tavo tikslus ir treniruočių rutiną.'),
    e("post workout nutrition", "Po treniruotės", 'Sotūs patiekalai suplanuoti po sporto be ilgo gaminimo.'),
    e("energy crash afternoon", "Popietės energija", 'Pietūs ir užkandžiai parinkti, kad energija būtų stabilesnė iki vakaro.'),
    e("pre workout fuel", "Prieš treniruotę", 'Patiekalai paskirstyti pagal tavo treniruočių laiką.'),
    e("marathon training food", "Ruošimasis bėgimui", 'Asmeninis planas pagal didesnį energijos poreikį.'),
    e("strength training diet", "Jėgos sportas", 'Porcijos suplanuotos receptuose pagal tavo tikslus.'),
    e("yoga practitioner meals", "Jogos praktika", 'Lengvesni patiekalai pagal tavo rutiną ir pageidavimus.'),
    e("crossfit busy athlete", "Crossfit tempas", 'Greiti sotūs patiekalai tarp treniruočių.'),
    e("walking habit nutrition", "Kasdienniai žingsniai", 'Planas palaiko pastovius valgymo įpročius aktyviam gyvenimui.'),
    e("morning workout breakfast", "Rytinė treniruotė", 'Pusryčiai suplanuoti pagal tavo sporto grafiką.'),
    e("evening gym dinner", "Vakarinė treniruotė", 'Vakarienė paruošta pagal laiką po sporto salės.'),
    e("rest day eating", "Poilsio diena", 'Patiekalai pritaikyti dienoms be intensyvaus sporto.'),
]

# ── Demographics ─────────────────────────────────────────────────────────────
POOL["Demographics"] = [
    e("mens health nutrition", "Vyrams pritaikyta", '"Tavo knyga" formuoja planą pagal tavo duomenis, tikslus ir porcijas.'),
    e("womens health nutrition", "Moterims pritaikyta", 'Asmeninis meniu atsižvelgia į tavo ciklą, tikslus ir pageidavimus.'),
    e("seniors easy nutrition", "Senjorams paprasta", 'Aiškūs receptai ir sąrašai be sudėtingų žingsnių.'),
    e("new parents both", "Jauni tėvai", 'Greiti patiekalai, kai laiko mažai, o energijos reikia daug.'),
    e("teens healthy habits", "Paaugliams įpročiai", 'Struktūruotas planas padeda formuoti sveikesnius įpročius.'),
    e("millennial budget cooking", "Millennial biudžetas", 'Biudžetui draugiški receptai su aiškiais sąrašais.'),
    e("gen z first kitchen", "Pirma virtuvė", 'Paprastas savaitės planas pradedančiajam gamintojui.'),
    e("over 50 metabolism", "Po penkiasdešimt", 'Planas atnaujinamas pagal tavo dabartinius poreikius.'),
    e("young professional single", "Jaunas profesionalas", 'Porcijos vienam su aiškiu savaitės meniu.'),
    e("stay at home parent", "Namuose su vaikais", 'Patiekalai suplanuoti pagal trumpas virtuvės pertraukas.'),
    e("dual income no kids", "Du karjeristai", 'Greiti vakarienės variantai be ilgo planavimo.'),
    e("multigenerational household", "Kelių kartų namai", 'Planas atsižvelgia į tavo duomenis ir namų dinamiką.'),
]

# ── Seasonal hooks ───────────────────────────────────────────────────────────
POOL["Seasonal hooks"] = [
    e("summer body preparation", "Pavasario kryptis", '"Tavo knyga" duoda savaitės planą pagal tavo tikslus, o ne trumpalaikį badavimą.'),
    e("holiday eating survival", "Šventės be chaoso", 'Planas padeda išlaikyti struktūrą aplink šventes.'),
    e("spring reset nutrition", "Pavasario resetas", 'Asmeninis meniu atnaujinamas pagal sezoną ir tavo tikslus.'),
    e("winter comfort healthy", "Žiemos komfortas", 'Sotūs patiekalai pagal tavo skonį be perteklinio švaistymo.'),
    e("summer BBQ balance", "Vasaros kepimas", 'Savaitės struktūra palieka vietos renginiams.'),
    e("autumn cozy meals", "Rudens jaukumas", 'Sezoniniai ingredientai suplanuoti per savaitę.'),
    e("new year resolution", "Naujų metų planas", '30 klausimų testas suformuoja realų planą, o ne abstraktų pažadą.'),
    e("beach vacation prep", "Prieš atostogas", 'Aiškus meniu padeda laikytis krypties prieš kelionę.'),
    e("back to school lunches", "Mokyklos pietūs", 'Pietūs suplanuoti pagal užimtą rugsėjo grafiką.'),
    e("christmas leftover plan", "Po Kalėdų", 'Ingredientai naudojami keliuose patiekaluose po švenčių.'),
    e("lent fasting structure", "Paso struktūra", 'Patiekalai pritaikyti pagal tavo apribojimus.'),
    e("ramadan meal planning", "Ramadano planas", 'Meniu pagal tavo valgymo langą ir rutiną.'),
]

# ── Wellness-adjacent ────────────────────────────────────────────────────────
POOL["Wellness-adjacent"] = [
    e("gut health focus", "Virškinimo ramybė", '"Tavo knyga" parenka patiekalus pagal tavo pageidavimus ir apribojimus.'),
    e("better sleep nutrition", "Miegui ramiau", 'Vakarienės suplanuotos pagal tavo rutiną, kad miegas būtų lengvesnis.'),
    e("skin health through food", "Oda ir maistas", 'Asmeninis planas padeda valgyti pastoviau be chaotiškų sprendimų.'),
    e("hormone balance meals", "Hormonų balansas", 'Receptai pagal tavo duomenis, o ne bendrą hormonų dietą.'),
    e("bloating reduction", "Mažiau pilvo pūtimo", 'Ingredientai kontroliuojami per savaitės planą.'),
    e("hydration and meals", "Vanduo ir maistas", 'Struktūruotas planas padeda pastovesnei kasdienybei.'),
    e("inflammation reduction", "Mažiau uždegimo", 'Patiekalai parinkti pagal tavo tikslus ir apribojimus.'),
    e("immune support eating", "Stipresnė kasdienybė", 'Įvairūs ingredientai suplanuoti per savaitę.'),
    e("stress resilience food", "Streso atsparumas", 'Mažiau sprendimų apie maistą sumažina kasdienį stresą.'),
    e("mental clarity nutrition", "Aiškesnė galva", 'Stabilūs valgymo laikai pagal tavo rutiną.'),
    e("energy without coffee", "Energija be kavos", 'Sotūs patiekalai padeda išvengti popietės energijos kritimo.'),
    e("microbiome friendly", "Žarnyno draugiška", 'Planas su aiškiais ingredientais kiekvienai dienai.'),
]

# ── Objections & pain points ─────────────────────────────────────────────────
POOL["Objections & pain points"] = [
    e("tried every diet", "Bandžiau visas dietas", '"Tavo knyga" duoda vieną asmeninį planą pagal tavo duomenis, o ne dar vieną universalų šabloną.'),
    e("confusing nutrition advice", "Prieštaringi patarimai", 'Vienas aiškus savaitės meniu vietoj dešimčių priešingų nuomonių.'),
    e("dont know what to cook", "Nežinau ką gaminti", 'Kiekvienai dienai konkretūs receptai ir pirkinių sąrašas.'),
    e("healthy food too expensive", "Sveika brangu?", 'Biudžetui draugiški receptai su tiksliais sąrašais.'),
    e("no time for meal planning", "Nėra laiko planuoti", '30 klausimų testas ir savaitės planas paruošti už tave.'),
    e("diets always fail", "Dietos vis žlunga", 'Struktūra veikia kas savaitę, o ne vienkartinis bandymas.'),
    e("cooking is boring", "Virtuvė nuobodi", 'Įvairūs patiekalai parinkti pagal tavo skonį.'),
    e("family wont eat healthy", "Šeima nevalgo", 'Planas atsižvelgia į pageidavimus ir apribojimus.'),
    e("too many ingredients", "Per daug ingredientų", 'Produktai naudojami keliuose patiekaluose per savaitę.'),
    e("subscription fatigue", "Prenumeratų nuovargis", 'Sumoki vieną kartą už asmeninį planą, kuris veikia kas savaitę.'),
    e("apps too complicated", "Per sudėtingos programėlės", 'Paprastas PDF planas ir sąrašai be skaičiavimo.'),
    e("generic meal plans", "Bendri planai neveikia", 'Asmeninis planas iš 30 klausimų testo pagal tavo situaciją.'),
]

# ── Transformation & social proof ────────────────────────────────────────────
POOL["Transformation & social proof"] = [
    e("finally stuck to plan", "Pagaliau laikiausi", 'Naudoju "Tavo knyga", ir pagaliau turiu savaitės planą, kurio laikausi.'),
    e("before after grocery bills", "Mažesnė sąskaita", 'Mano savaitinė maisto sąskaita sumažėjo, nes perku pagal aiškų planą.'),
    e("stopped ordering takeout", "Mažiau užsakymų", 'Kai žinai vakarienės receptą, rečiau užsakau greitą maistą.'),
    e("kids eating better", "Vaikai valgo geriau", 'Planas atsižvelgia į šeimos pageidavimus ir rutiną.'),
    e("husband joined plan", "Vyras prisijungė", 'Asmeninis meniu pagal tavo duomenis, bet patiekalai tinka visai šeimai.'),
    e("lost weight without counting", "Be skaičiavimo", 'Porcijos suplanuotos receptuose, todėl nereikia skaičiuoti kiekvieno kąsnio.'),
    e("more energy daily", "Daugiau energijos", 'Pastovus valgymas pagal planą padėjo jaustis žvaliau dieną.'),
    e("less food waste monthly", "Mažiau švaistymo", 'Ingredientai naudojami keliuose patiekaluose, todėl mažiau išmetu.'),
    e("cooking confidence grew", "Pasitikėjimas virtuvėje", 'Aiškūs receptai padėjo gaminti be nuolatinės paieškos.'),
    e("weekend no longer ruins", "Savaitgalis negriauna", 'Penktadienį jau žinai savaitgalio patiekalus ir pirkinius.'),
    e("friends asked my secret", "Draugai klausia", 'Pasidalinu, kad turiu asmeninį savaitės planą iš "Tavo knyga".'),
    e("three months consistent", "Trys mėnesiai", 'Vienas planas veikia kas savaitę, todėl lengviau išlaikyti įpročius.'),
]

# ── Save money & budget ──────────────────────────────────────────────────────
POOL["Save money & budget"] = [
    e("smart meal planning budget", "Protingi maisto planai", '"Tavo knyga" sudaro visiškai asmeninį savaitės planą su biudžetui draugiškais receptais ir tiksliais pirkinių sąrašais.'),
    e("reduce grocery overspending", "Mažiau permokėjimo", 'Perki pagal aiškų planą, o ne spėlioji patiekalus parduotuvėje.'),
    e("real money savings", "Realiai sutaupyk", 'Naudoju "Tavo knyga", ir mano savaitinė maisto sąskaita sumažėjo, nes perku pagal planą.'),
    e("one time payment value", "Vienkartinis mokestis", 'Sumoki vieną kartą už asmeninį planą, kuris veikia kas savaitę, o ne švaistai pinigus kiekvieną kartą galvodama patiekalus.'),
    e("stop duplicate purchases", "Be dublių", 'Sąrašas pagal receptus, todėl nenuperki to paties du kartus.'),
    e("budget proteins", "Biudžetiniai baltymai", 'Receptai parinkti pagal tavo biudžetą ir tikslus.'),
    e("cheap healthy week", "Pigi sveika savaitė", 'Biudžetui draugiški ingredientai suplanuoti per savaitę.'),
    e("coupon friendly shopping", "Su nuolaidomis", 'Aiškus sąrašas padeda planuoti pirkinius iš anksto.'),
    e("bulk buy smart", "Didelis kiekis", 'Planas padeda panaudoti didesnius kiekius be švaistymo.'),
    e("eating out cost comparison", "Namai vs restoranas", 'Gaminti pagal planą dažnai pigiau nei nuolatiniai užsakymai.'),
    e("student food budget", "Studentų biudžetas", 'Paprasti receptai su tiksliais sąrašais kiekvienai savaitei.'),
    e("inflation grocery prices", "Brangstant maistui", 'Biudžetui draugiški patiekalai su aiškiais ingredientais.'),
]

# ── Reduce food waste ────────────────────────────────────────────────────────
POOL["Reduce food waste"] = [
    e("reduce food waste", "Sumažink maisto švaistymą", 'Kiekvienas ingredientas naudojamas keliuose patiekaluose, kad neišmestum pusės pirkinių.'),
    e("use leftovers smart", "Likučiai suplanuoti", 'Savaitės meniu suplanuotas taip, kad produktai būtų panaudoti.'),
    e("fridge cleanout meals", "Šaldytuvo tvarka", 'Receptai su aiškiais kiekiais, kad mažiau maisto sugestų.'),
    e("vegetables before spoil", "Daržovės laiku", 'Ingredientai paskirstyti per kelis patiekalus per savaitę.'),
    e("bread waste solution", "Mažiau senos duonos", 'Planas padeda pirkti tik tiek, kiek reikia receptams.'),
    e("herbs full use", "Žolelės iki galo", 'Produktai naudojami keliuose patiekaluose, o ne lieka vienam receptui.'),
    e("meal plan portion accuracy", "Tikslūs kiekiai", 'Porcijos suplanuotos, todėl mažiau pertekliaus virtuvėje.'),
    e("freezer burn prevention", "Šaldiklis tvarkingas", 'Paruošimas pagal savaitės planą sumažina pamirštus produktus.'),
    e("expiry date planning", "Galiojimo datos", 'Pirkinių sąrašas pagal receptų seką per savaitę.'),
    e("zero waste mindset", "Be švaistymo", '"Tavo knyga" suplanuoja ingredientus taip, kad jie būtų panaudoti.'),
]

# ── Planning & personalisation ───────────────────────────────────────────────
POOL["Planning & personalisation"] = [
    e("weekly meal planning", "Savaitės planas", '"Tavo knyga" sudaro asmeninį savaitės meniu su tiksliais pirkinių sąrašais.'),
    e("30 question personalization", "30 klausimų testas", 'Planas formuojamas pagal tavo tikslus, skonį, alergijas ir rutiną.'),
    e("personalised recipe book", "Asmeninė knyga", 'Gausi planą pagal tavo atsakymus, o ne bendrą šabloną visiems.'),
    e("shopping list exact", "Tikslūs sąrašai", 'Kiekvienai savaitei aiškus pirkinių sąrašas pagal receptus.'),
    e("avoid disliked foods", "Be nemėgstamų", 'Receptai be produktų, kurių nenori, pagal tavo atsakymus.'),
    e("allergy aware planning", "Su alergijomis", 'Ingredientai filtruojami pagal tavo duomenis.'),
    e("taste preference match", "Tavo skonis", 'Patiekalai parinkti pagal tai, ką mėgsti valgyti.'),
    e("schedule matched meals", "Pagal grafiką", 'Valgymo laikai pritaikyti pagal tavo dieną.'),
    e("goal based nutrition", "Pagal tikslą", 'Planas atitinka tavo svorio, energijos ar sveikatos tikslus.'),
    e("one plan whole week", "Viena savaitė", 'Visi patiekalai suplanuoti iš anksto, be kasdienio galvojimo.'),
]


def _body(template: int, clause: str) -> str:
    templates = [
        f'"Tavo knyga" sudaro asmeninį savaitės planą su tiksliais pirkinių sąrašais, kad {clause}.',
        f'Naudoju "Tavo knyga", ir {clause}.',
        f'Po 30 klausimų testo "Tavo knyga" parenka receptus pagal tavo tikslus, kai {clause}.',
        f'Kiekvienas ingredientas "Tavo knyga" plane naudojamas keliuose patiekaluose, kad {clause}.',
        f'Sumoki vieną kartą už "Tavo knyga" planą, kuris veikia kas savaitę, kai {clause}.',
        f'Asmeninis "Tavo knyga" meniu atsižvelgia į tavo pageidavimus, jei {clause}.',
        f'"Tavo knyga" duoda aiškų pirkinių sąrašą, todėl {clause}.',
        f'Naudoju "Tavo knyga", nes {clause}.',
    ]
    return templates[template % len(templates)]


def _expand_category(cat: str, items: list[tuple[str, str, str, int]]) -> None:
    for theme, hook, clause, tmpl in items:
        POOL.setdefault(cat, []).append(e(theme, hook, _body(tmpl, clause)))


# Bulk expansion to reach ~600 entries (clause = Lithuanian benefit clause)
_expand_category("Body & weight goals", [
    ("portion control simple", "Aiškios porcijos", "nereikia spėlioti, kiek valgyti kiekvieną vakarą", 0),
    ("weekend sabotage", "Savaitgalis kontrolėje", "penktadienį jau žinai savaitgalio patiekalus ir pirkinius", 6),
    ("late night snacks", "Vakariniai užkandžiai", "mažiau temptų impulsyviai užkandžiauti po vakarienės", 2),
    ("belly fat focus", "Sveikesnis pilvas", "meniu atitinka tavo tikslus, o ne bendrus patarimus", 5),
    ("metabolism steady", "Ramesnis metabolizmas", "valgai pastoviau be dietų šokinėjimo", 1),
    ("post holiday", "Po švenčių lengviau", "greičiau grįžti prie įprasto ritmo be perteklinių pirkinių", 3),
    ("mindful eating", "Sąmoningesnis valgymas", "žinai, ką gaminsi kiekvieną vakarą", 6),
    ("maintain weight", "Išlaikyk svorį", "vienas planas veikia kas savaitę be nuolatinio naujo meniu", 4),
    ("emotional eating", "Mažiau emocinio valgymo", "sumažėja sprendimų nuovargis streso metu", 2),
    ("skip meals fix", "Ne praleisk valgymų", "patiekalai paskirstyti per dieną pagal tavo grafiką", 0),
    ("hidden sauce calories", "Mažiau paslėptų kalorijų", "receptai su aiškiais ingredientais ir kiekiais", 6),
    ("eat out less", "Mažiau restoranų", "dažniau gamini, kai žinai tikslų savaitės meniu", 1),
    ("breakfast habit", "Stabilus pusrytis", "rytas įtrauktas į planą su konkrečiais receptais", 0),
    ("family portions", "Šeimos stalas", "valgai kartu, bet pagal savo porcijas", 5),
    ("afternoon slump", "Popietė be kritimo", "energija stabilesnė iki vakaro", 2),
    ("no food scale", "Be svarstyklių", "porcijos jau suplanuotos receptuose", 6),
    ("fresh start weight", "Nauja pradžia", "testas greitai suformuoja planą pagal dabartį", 4),
    ("clothes fit", "Drabužiai tinka", "lengviau laikytis krypties be obsesijos skaičiais", 1),
    ("vacation return", "Po atostogų", "greičiau grįžti prie rutinos namuose", 3),
    ("night shift eating", "Naktinis grafikas", "meniu pritaikytas tavo darbo ritmui", 5),
    ("desk job gain", "Sėdimas darbas", "sotūs pietūs be greito maisto impulso", 0),
    ("work stress snacks", "Stresas darbe", "mažiau saldžių impulsų ilgą dieną", 2),
    ("healthy home snacks", "Sveiki užkandžiai", "namuose perki tik tai, kas tinka planui", 6),
    ("meal timing", "Valgymo laikas", "patiekalai paskirstyti pagal tavo dieną", 0),
    ("fiber satiety", "Sotesnis maistas", "valgai sotiai su įprastais produktais", 1),
    ("protein balance", "Balansas kiekviename", "kiekvienam patiekalui suderinti ingredientai", 5),
    ("less processed", "Mažiau pusgaminių", "receptai iš aiškių ingredientų kasdien", 6),
    ("batch weight loss", "Kartą gaminti", "dalį maisto paruoši iš anksto be pertekliaus", 3),
    ("social events", "Renginiai be kaltės", "išlaikai struktūrą aplink savaitę", 2),
    ("no tracking apps", "Be programėlių", "pakanka paprasto savaitės plano ir sąrašų", 4),
])

_expand_category("Health conditions", [
    ("gestational diabetes 2", "Nėštumo cukrus", "meniu stabilesnis pagal tavo atsakymus", 5),
    ("insulin resistance 2", "Insulino jautrumas", "valgai pastoviau per dieną", 1),
    ("metabolic syndrome 2", "Metabolinė sveikata", "mažiau impulsinių sprendimų kasdien", 0),
    ("chronic fatigue 2", "Daugiau energijos", "mažiau jėgų skirtum sprendimams, ką valgyti", 6),
    ("migraine triggers 2", "Mažiau migrenų", "lengviau vengti žinomų triggerių produktų", 6),
    ("eczema diet 2", "Oda ir maistas", "stebi, kaip maistas veikia savijautą", 5),
    ("arthritis diet 2", "Sąnariams lengviau", "laikai pastovesnę mitybos kryptį", 1),
    ("blood pressure 2", "Kraujo spaudimas", "porcijos suplanuotos pagal tavo duomenis", 0),
    ("crohns daily 2", "Krono kasdienybė", "meniu pritaikytas pagal tavo apribojimus", 5),
    ("colitis gentle 2", "Švelnus meniu", "mažiau streso renkantis patiekalus", 2),
    ("sibo rotation 2", "SIBO planas", "vengi pasikartojančių triggerių", 6),
    ("ncgs gluten 2", "Jautrumas gliadinui", "receptai be gliadino pagal tavo atsakymus", 5),
    ("oral allergy 2", "Sezoniniai alergenai", "receptai atitinka tai, ką gali valgyti", 5),
    ("diabetes weight 2", "Cukrus ir svoris", "tikslai sujungti viename savaitės plane", 0),
    ("cholesterol family 2", "Šeima ir cholesterolis", "asmeninės porcijos namuose", 5),
    ("pcos cravings 2", "PCOS ir saldumynai", "mažiau impulsyvių saldžių užkandžių", 2),
    ("ibs eating out 2", "IBS ir restoranai", "dažniau valgai kontroliuojamoje aplinkoje", 1),
    ("thyroid weight 2", "Skydliaukė ir svoris", "meniu atnaujinamas pagal tavo poreikius", 5),
    ("multiple intolerances 2", "Keli apribojimai", "ingredientai filtruojami pagal tavo duomenis", 6),
    ("post surgery 2", "Po operacijos", "švelnesnis perėjimas prie įprasto valgymo", 5),
    ("medication food 2", "Vaistai ir maistas", "lengviau derini mitybą su rekomendacijomis", 6),
    ("inflammation 2", "Mažiau uždegimo", "valgai pastoviau be chaoso", 1),
    ("hormone food 2", "Hormonų balansas", "tikslai atsižvelgiami į planą", 5),
    ("morning sugar 2", "Rytinis cukrus", "diena prasideda stabiliau", 0),
    ("neuropathy 2", "Nervų sveikata", "svarbus nuoseklumas, o ne eksperimentai", 4),
    ("pancreatitis 2", "Kasa atsigavimas", "receptai pagal tavo apribojimus", 5),
    ("gallbladder 2", "Mažiau riebalų", "lengvesni patiekalai su aiškiais ingredientais", 6),
    ("iron meals 2", "Geležies planas", "įtraukiami tinkami patiekalai", 0),
    ("vitamin d habits 2", "Vitamino D rutina", "pastovesni valgymo įpročiai", 1),
    ("celiac family 2", "Be gliadino šeimai", "sąrašas apsaugo nuo klaidų parduotuvėje", 6),
])

_expand_category("Life stages & milestones", [
    ("postpartum week 2", "Po gimdymo", "planas pritaikytas trumpam laikui virtuvėje", 0),
    ("breastfeeding 2", "Žindymo metu", "valgai reguliariai be ilgo planavimo", 1),
    ("menopause 2", "Menopauzės etapas", "poreikiai atnaujinami pagal atsakymus", 5),
    ("forty reset 2", "Po keturiasdešimt", "planas pagal dabartinį etapą", 4),
    ("wedding prep 2", "Prieš vestuves", "laikai kryptį be chaotiško badavimo", 0),
    ("new year 2", "Nauji metai", "gauni realų planą, o ne abstraktų pažadą", 4),
    ("september routine 2", "Rugsėjo rutina", "patiekalai pagal užimtą grafiką", 0),
    ("empty nest 2", "Tuščias lizdas", "porcijos pritaikytos vienam ar dviem", 5),
    ("new parents 2", "Nauji tėvai", "valgai, kai miegas trumpas", 1),
    ("retirement 2", "Po pensijos", "mažiau chaoso virtuvėje", 6),
    ("student budget 2", "Studentų biudžetas", "biudžetui draugiški receptai kiekvienai savaitei", 0),
    ("first apartment 2", "Pirmas butas", "mokaisi planuoti pirkinius ir patiekalus", 4),
    ("pregnancy stages 2", "Nėštumo etapai", "planas pritaikomas kiekvienam etapui", 5),
    ("fertility 2", "Vaisingumo rutina", "svarbi kasdienė struktūra", 0),
    ("fresh start 2", "Naujas etapas", "planas tik tau su aiškiais receptais", 4),
    ("moving week 2", "Perkraustymas", "rutina išlieka judant", 6),
    ("promotion busy 2", "Karjeros šuolis", "greiti pietūs ilgose dienose", 0),
    ("exams 2", "Egzaminų laikas", "žinai, ką valgysi kiekvieną dieną", 6),
    ("travel return 2", "Po kelionių", "greičiau grįžti prie namų rutinos", 3),
    ("grandparents 2", "Seneliai ir vaikai", "atsižvelgiama į namų dinamiką", 5),
    ("midlife 2", "Vidurio gyvenimo", "keiti įpročius ramiai", 1),
    ("engagement 2", "Prieš šventę", "laikai planą prieš renginius", 0),
    ("pre uni 2", "Prieš universitetą", "pirmas savarankiškas planas", 4),
    ("commute job 2", "Ilgas kelias", "patiekalai pagal trumpą laiką vakare", 0),
    ("burnout recovery 2", "Po perdegimo", "mažiau sprendimų naštos", 2),
    ("baby solids 2", "Kūdikio etapas", "suaugusiųjų mityba nenukrypsta", 5),
    ("teen leaving 2", "Paauglys išvyksta", "porcijos keičiasi kartu su šeima", 6),
    ("caregiving parents 2", "Globa tėvams", "gamini be papildomo galvojimo", 6),
    ("honeymoon back 2", "Po medaus mėnesio", "grįžti prie rutinos be impulsų", 1),
    ("spring wedding 2", "Pavasario vestuvės", "konkretūs patiekalai kiekvienai savaitei", 0),
])

_expand_category("Dietary approaches", [
    ("paleo meals 2", "Paleo kryptis", "ingredientai suplanuoti pagal tavo duomenis", 0),
    ("whole30 reset 2", "Švarus mėnuo", "konkretūs produktai kiekvienai savaitei", 6),
    ("pescatarian 2", "Žuvis ir daržovės", "aiškūs pirkinių sąrašai", 6),
    ("flexitarian 2", "Lanksti mityba", "derini pageidavimus be griežtų taisyklių", 5),
    ("clean eating 2", "Švarus maistas", "receptai iš aiškių ingredientų", 0),
    ("ayurvedic 2", "Ritmo mityba", "planas pagal tavo rutiną", 5),
    ("raw tilt 2", "Daugiau šviežio", "subalansuoti patiekalai pagal tikslus", 5),
    ("low histamine 2", "Mažai histamino", "kontroliuojami ingredientai per savaitę", 6),
    ("aip rotation 2", "AIP rotacija", "vengi triggerių su aiškiais produktais", 6),
    ("halal 2", "Halal planas", "meniu pagal tavo apribojimus", 5),
    ("kosher 2", "Košerinė kryptis", "atsižvelgiama į produktų pasirinkimą", 5),
    ("hindu veg 2", "Vegetariška tradicija", "receptai pagal pageidavimus", 5),
    ("mindful buddhist 2", "Sąmoningas valgymas", "mažiau impulsyvaus valgymo", 2),
    ("omad 2", "Vienas valgymas", "didelė porcija pagal tavo rutiną", 0),
    ("5 2 fasting 2", "5:2 struktūra", "patiekalai pagal badymo dienas", 0),
    ("carnivore curious 2", "Mėsos kryptis", "planas pagal tavo apribojimus", 5),
    ("no red meat 2", "Be raudonos mėsos", "receptai pagal tavo atsakymus", 5),
    ("egg free 2", "Be kiaušinių", "alternatyvos pagal apribojimus", 5),
    ("soy free vegan 2", "Vegan be sojos", "filtruojami ingredientai", 6),
    ("nightshade free 2", "Be šešėlinių", "vengiami nurodyti produktai", 6),
    ("slow carb 2", "Lėti angliavandeniai", "aiškūs patiekalai kiekvienai dienai", 0),
    ("blue zone 2", "Ilgam gyvenimui", "receptai pagal tavo tikslus", 5),
    ("detox week 2", "Švelnus resetas", "struktūruotas meniu be ekstremumų", 0),
    ("carb cycling 2", "Angliavandenių ciklai", "patiekalai pagal savaitės struktūrą", 0),
    ("zone diet 2", "Zonos principas", "porcijos receptuose pagal tikslus", 0),
    ("south beach 2", "Pietų stilius", "aiškūs ingredientai kiekvienai savaitei", 6),
    ("ww alternative 2", "Be taškų", "vienas planas vietoj skaičiavimo", 4),
    ("atkins 2", "Mažai angliavandenių", "receptai pagal pageidavimus", 5),
    ("dukan 2", "Baltymų kryptis", "patiekalai suderinti pagal duomenis", 5),
    ("intuitive structure 2", "Intuityvi struktūra", "ramybė be griežtų taisyklių", 4),
])

_expand_category("Lifestyle & convenience", [
    ("single portions 2", "Vienai porcijai", "kiekiai pritaikyti vienam žmogui", 0),
    ("couple planning 2", "Porai dviese", "planas pagal abiejų poreikius", 5),
    ("large family 2", "Didelė šeima", "ingredientai keliems patiekalams", 3),
    ("wfh lunch 2", "Darbas namuose", "mažiau atsitiktinių užkandžių", 2),
    ("office lunch 2", "Pietūs į darbą", "porcijos kiekvienai darbo dienai", 0),
    ("small kitchen 2", "Maža virtuvė", "paprasti įrankiai ir ingredientai", 6),
    ("one pan 2", "Vienas puodas", "paprasti receptai su aiškiu planu", 0),
    ("air fryer 2", "Orkaitė greitai", "patiekalai greitam gaminimui", 0),
    ("slow cooker 2", "Lėtas puodas", "dalį paruoši iš anksto", 3),
    ("leftovers 2", "Likučiai panaudoti", "produktai suplanuoti per savaitę", 3),
    ("freezer prep 2", "Šaldiklis pasiruošęs", "dalį maisto paruoši iš anksto", 3),
    ("commuter breakfast 2", "Pusryčiai kelyje", "greiti pusryčiai ryte", 0),
    ("gym night 2", "Po treniruotės", "sotūs patiekalai be ilgo gaminimo", 0),
    ("two jobs 2", "Du darbai", "patiekalai pagal trumpas pertraukas", 0),
    ("shift worker 2", "Pamaininis darbas", "meniu pagal naktinį grafiką", 5),
    ("sales travel 2", "Dažnai kelyje", "namų rutina grįžus", 1),
    ("minimal cleanup 2", "Mažiau indų", "paprasti receptai", 0),
    ("picky solo 2", "Išrankus vienas", "nemėgstami produktai išfiltruoti", 6),
    ("roommate 2", "Su roommate", "planas pagal tavo porcijas", 5),
    ("dorm 2", "Bendrabutis", "paprasti patiekalai", 0),
    ("elderly simple 2", "Paprasta senjorams", "aiškūs žingsniai be sudėtingumo", 6),
    ("caregiver 2", "Globėjo laikas", "greiti patiekalai trumpoms pertraukoms", 0),
    ("homemaker 2", "Namų rutina", "mažiau kasdienio sprendimų krūvio", 2),
    ("freelancer 2", "Laisvai samdomas", "planas pagal kintantį grafiką", 5),
    ("startup 2", "Startuolio tempas", "sotūs patiekalai be spėliojimo", 0),
    ("teacher lunch 2", "Mokytojo pietūs", "trumpi pietūs per pertrauką", 0),
    ("nurse shift 2", "Slaugytojo pamaina", "patiekalai ilgai pamainai", 0),
    ("driver road 2", "Vairuotojo diena", "paruošti pietūs namuose", 0),
    ("construction lunch 2", "Sotūs pietūs", "patiekalai pagal tavo tikslus", 5),
    ("sunday reset 2", "Sekmadienio resetas", "planas ir sąrašai paruošti iš karto", 6),
])

_expand_category("Emotional & psychological", [
    ("cravings sugar 2", "Mažiau saldumo", "mažiau impulsyvių saldumynų", 2),
    ("stress eating 2", "Stresinis valgymas", "mažiau valgymo dėl emocijų", 2),
    ("diet burnout 2", "Po dietų nuovargio", "nebandai nuo nulio kiekvieną mėnesį", 4),
    ("no willpower 2", "Be valios kovos", "veiki, kai motyvacija svyruoja", 1),
    ("food guilt 2", "Mažiau kaltės", "valgai ramiau su aiškiu planu", 1),
    ("binge cycle 2", "Be binge ciklo", "nutrauki badavimo ir persivalgymo ratą", 2),
    ("comfort replace 2", "Komfortas kitaip", "sotūs patiekalai be chaoso", 0),
    ("food anxiety 2", "Mažiau nerimo", "mažiau streso dėl sprendimų", 2),
    ("perfection diet 2", "Be tobulybės", "kryptis be viskas arba nieko", 4),
    ("shame eating 2", "Mažiau gėdos", "ramesnis santykis su maistu", 1),
    ("reward food 2", "Ne maisto prizas", "sotinantys patiekalai plane", 0),
    ("lonely dinner 2", "Vakarienė viena", "gamini sau, o ne užsakai impulsyviai", 1),
    ("boredom eating 2", "Mažiau nuobodulio", "žinai vakarienės receptą iš anksto", 6),
    ("procrastination cooking 2", "Mažiau vilkinimo", "žingsniai jau suplanuoti", 6),
    ("all or nothing 2", "Be kraštutinumų", "planas veikia ir ne tobulomis dienomis", 4),
    ("comparison trap 2", "Be lyginimosi", "tavo planas pagal tavo duomenis", 5),
    ("motivation monday 2", "Ne tik pirmadienis", "struktūra veikia visą savaitę", 0),
    ("self sabotage 2", "Mažiau sabotažo", "mažiau impulsų parduotuvėje", 6),
    ("habit rebuilding 2", "Nauji įpročiai", "kasdienė struktūra padeda pradėti", 0),
    ("control eating 2", "Daugiau kontrolės", "sprendimai priimti iš anksto", 6),
    ("fear of cooking 2", "Mažiau baimės", "paprasti receptai žingsnis po žingsnio", 0),
    ("overthinking meals 2", "Mažiau galvojimo", "vakarienė jau pasirinkta", 6),
    ("night emotional 2", "Naktinis impulsas", "vakarienė suplanuota sotinančiai", 0),
    ("social pressure food 2", "Mažiau spaudimo", "laikai savo kryptį aplink renginius", 2),
    ("identity eating 2", "Tavo identitetas", "planas atitinka tavo tikslus", 5),
    ("habit stacking 2", "Įpročių grandinė", "valgymas tampa dalimi rutinos", 0),
    ("mindless scrolling food 2", "Mažiau scrollinimo", "receptai paruošti, ne ieškomi", 6),
    ("stress week eating 2", "Stresinė savaitė", "mažiau sprendimų krūvio", 2),
    ("recovery relationship food 2", "Ramesnis santykis", "mažiau chaoso su maistu", 1),
    ("small wins food 2", "Maži žingsniai", "kasdien aiškus planas", 6),
])

# Fill remaining categories to ~600 total
for cat, clauses in {
    "Fitness & energy": [
        ("protein recovery", "Atkūrimas po sporto", "sotūs patiekalai po treniruotės"),
        ("endurance fuel", "Ištvermės sportas", "energija paskirstyta per dieną"),
        ("hiit nutrition", "HIIT mityba", "greiti sotūs patiekalai"),
        ("pilates meals", "Pilates rutina", "lengvesni patiekalai pagal grafiką"),
        ("swimming appetite", "Plaukimo diena", "porcijos pagal treniruotę"),
        ("cycling fuel", "Dviračio treniruotė", "patiekalai prieš ir po sporto"),
        ("hiking weekends", "Žygiai savaitgalį", "energingi patiekalai plane"),
        ("home workout food", "Sportas namuose", "sotūs patiekalai be ilgo gaminimo"),
        ("protein breakfast gym", "Pusryčiai prieš sportą", "stabilus rytas"),
        ("late gym meal", "Vėlai po salės", "vakarienė paruošta greitai"),
    ],
    "Demographics": [
        ("dad bod fix", "Tėvų sveikata", "planas pagal tavo tikslus"),
        ("working mom meals", "Dirbanti mama", "greiti patiekalai trumpam laikui"),
        ("single dad cooking", "Vienas tėvas", "porcijos ir receptai tau"),
        ("retired couple", "Pora pensijoje", "paprastas savaitės meniu"),
        ("young couple budget", "Jauna pora", "biudžetui draugiškas planas"),
        ("empty nester health", "Tuščias lizdas", "porcijos keičiasi kartu su gyvenimu"),
        ("college athlete", "Studentas sportininkas", "energija pagal treniruotes"),
        ("night nurse mom", "Naktinė pamaina", "meniu pagal grafiką"),
        ("immigrant cooking", "Nauja šalis", "įprasti produktai tavo planui"),
        ("rural grocery", "Mažas miestelis", "paprasti ingredientai sąraše"),
    ],
    "Seasonal hooks": [
        ("january reset", "Sausio startas", "realus planas, ne ekstremalus"),
        ("february slump", "Vasario rutina", "struktūra, kai motyvacija krenta"),
        ("march spring", "Kovo atgimimas", "planas atnaujinamas pagal sezoną"),
        ("april lighter", "Balandžio lengvumas", "švelnesni patiekalai plane"),
        ("may outdoor", "Gegužės sezonas", "patiekalai pagal aktyvesnį grafiką"),
        ("june summer", "Birželio startas", "struktūra prieš atostogas"),
        ("july heat meals", "Karščio dienos", "lengvi patiekalai pagal rutiną"),
        ("august vacation end", "Rugpjūčio pabaiga", "grįžimas prie rutinos"),
        ("october cozy", "Spalio jaukumas", "sotūs sezoniniai patiekalai"),
        ("november prep", "Lapkričio ruoša", "planas prieš šventes"),
    ],
    "Wellness-adjacent": [
        ("digestive calm", "Virškinimo ramybė", "ingredientai kontroliuojami plane"),
        ("sleep dinner timing", "Miegas ir vakarienė", "vakarienės pagal rutiną"),
        ("skin glow food", "Oda ir maistas", "pastovesnė kasdienybė"),
        ("hormone support", "Hormonų palaikymas", "planas pagal tavo duomenis"),
        ("bloat reduce", "Mažiau pūtimo", "aiškūs ingredientai"),
        ("hydration meals", "Vanduo ir maistas", "struktūruota savaitė"),
        ("immune routine", "Kasdienė stiprybė", "įvairūs ingredientai plane"),
        ("stress gut", "Stresas ir gut", "mažiau chaotiškų sprendimų"),
        ("focus food", "Dėmesys dienai", "stabilūs valgymo laikai"),
        ("afternoon clarity", "Popietės aiškumas", "energija be kritimo"),
    ],
    "Objections & pain points": [
        ("too hard to start", "Lengva pradėti", "testas ir planas paruošti už tave"),
        ("no results before", "Anksčiau neveikė", "asmeninis planas, ne bendras šablonas"),
        ("hate cooking", "Nemėgsti gaminti", "paprasti greiti receptai"),
        ("partner picky", "Išrankus partneris", "pageidavimai įtraukti į planą"),
        ("kids junk food", "Vaikai ir greitas", "struktūra padeda namuose"),
        ("no kitchen skills", "Nėra įgūdžių", "aiškūs žingsniai kiekviename recepte"),
        ("always hungry", "Nuolat alkanas", "sotūs patiekalai plane"),
        ("too many diets info", "Per daug info", "vienas aiškus savaitės meniu"),
        ("cant afford healthy", "Sveika nebrangu", "biudžetui draugiški receptai"),
        ("no time ever", "Niekada nėra laiko", "planavimas atliktas už tave"),
    ],
    "Transformation & social proof": [
        ("month one done", "Pirmas mėnuo", "pagaliau turiu planą, kurio laikausi"),
        ("grocery bill down", "Mažesnė sąskaita", "perku pagal aiškų planą"),
        ("takeout cut half", "Pusė užsakymų", "žinai vakarienės receptą"),
        ("kids try vegetables", "Vaikai ragauja", "patiekalai pagal šeimos rutiną"),
        ("partner cooks too", "Kartu gaminate", "aiškūs receptai abiem"),
        ("weight without obsession", "Be obsesijos", "porcijos jau receptuose"),
        ("energy up daily", "Daugiau energijos", "pastovesnis valgymas"),
        ("waste cut monthly", "Mažiau švaistymo", "ingredientai panaudoti"),
        ("confidence kitchen", "Pasitikėjimas virtuvėje", "receptai be paieškos"),
        ("weekend on track", "Savaitgalis tvarkingas", "žinai savaitgalio patiekalus"),
    ],
    "Save money & budget": [
        ("smart lists", "Protingi sąrašai", "perki tik suplanuotus produktus"),
        ("no duplicate buys", "Be dublių", "sąrašas pagal receptus"),
        ("cheap protein week", "Pigūs baltymai", "receptai pagal biudžetą"),
        ("aldi week plan", "Savaitė ALDI", "biudžetui draugiški ingredientai"),
        ("inflation week", "Brangstant maistui", "aiškūs kiekiai be pertekliaus"),
        ("student save", "Studentas taupo", "paprasti pigūs patiekalai"),
        ("family budget 50", "50 eurų savaitė", "planas pagal biudžetą"),
        ("coupon plan", "Su nuolaidomis", "pirkinius planuoji iš anksto"),
        ("bulk chicken use", "Vištiena keliems", "ingredientas keliuose patiekaluose"),
        ("eat out savings", "Mažiau restoranų", "namų planas pigesnis"),
    ],
    "Reduce food waste": [
        ("spinach use up", "Špinatai iki galo", "ingredientas keliuose patiekaluose"),
        ("yogurt before expiry", "Jogurtas laiku", "panaudojamas pagal planą"),
        ("carrot tops use", "Morkos iki galo", "kiekiai tikslūs receptuose"),
        ("cheese ends", "Sūris iki galo", "suplanuotas keliuose patiekaluose"),
        ("bread plan", "Duona be švaistymo", "perki tiek, kiek reikia"),
        ("herb bunch", "Žolelės iki galo", "naudojamos keliuose receptuose"),
        ("fruit ripen", "Vaisiai laiku", "paskirstyti per savaitę"),
        ("meat portion exact", "Mėsa be pertekliaus", "tikslūs kiekiai"),
        ("sauce jar finish", "Padažas iki galo", "planuotas keliuose patiekaluose"),
        ("veg drawer clean", "Šaldytuvas tvarkingas", "produktai suplanuoti"),
    ],
    "Planning & personalisation": [
        ("quiz personal plan", "Testas ir planas", "30 klausimų formuoja meniu"),
        ("allergy filter", "Alergijų filtras", "ingredientai pagal tavo duomenis"),
        ("dislike filter", "Be nemėgstamų", "receptai tik su mėgstamais"),
        ("schedule match", "Pagal grafiką", "valgymo laikai pritaikyti"),
        ("goal weight plan", "Svorio tikslas", "planas atitinka tikslą"),
        ("energy goal plan", "Energijos tikslas", "patiekalai pagal poreikį"),
        ("taste match plan", "Skonio atitikimas", "mėgsti tai, ką gamini"),
        ("family size plan", "Šeimos dydis", "porcijos pagal namus"),
        ("cooking time match", "Pagal laiką", "receptai pagal rutiną"),
        ("weekly auto plan", "Automatinė savaitė", "viskas suplanuota iš anksto"),
    ],
}.items():
    hooks = [
        "Tavo asmeninis planas", "Mažiau spėliojimo", "Aiškus savaitės meniu",
        "Be chaoso virtuvėje", "Planas pagal tave", "Pirkinių sąrašas",
        "Receptai tau", "Struktūra kasdien", "Mažiau sprendimų", "Tavo ritmas",
    ]
    for i, (theme, hook, clause) in enumerate(clauses):
        _expand_category(cat, [(theme, hook, clause, i)])

# Top-up to ~600 entries
_TOPUP: list[tuple[str, str, str, int]] = [
    ("Body & weight goals", "sustainable habits", "Ilgaamžiai įpročiai", "svoris keičiasi be dietų šokinėjimo", 1),
    ("Body & weight goals", "water intake meals", "Daugiau vandens", "patiekalai suderinti su hidratacija", 0),
    ("Body & weight goals", "plateau break", "Stabdymo etapas", "planas atnaujinamas pagal tavo duomenis", 5),
    ("Body & weight goals", "vacation mindset", "Atostogų mąstymas", "struktūra padeda grįžti namo", 2),
    ("Health conditions", "prediabetes 2", "Prieš diabetą", "mažiau cukraus šuolių kasdien", 2),
    ("Health conditions", "high bp sodium", "Mažiau druskos", "ingredientai kontroliuojami plane", 6),
    ("Health conditions", "PCOS insulin", "PCOS ir insulinas", "pastovesnis valgymas per dieną", 1),
    ("Health conditions", "IBS flare", "IBS paūmėjimas", "švelnesnis meniu pagal apribojimus", 5),
    ("Life stages & milestones", "first trimester", "Pirmas trimestras", "planas pagal tavo pageidavimus", 5),
    ("Life stages & milestones", "third trimester", "Trečias trimestras", "greiti patiekalai trumpam laikui", 0),
    ("Life stages & milestones", "newlywed meals", "Naujagaliai", "porcijos porai be chaoso", 0),
    ("Life stages & milestones", "empty nest health", "Tuščias lizdas", "mažesnės porcijos be pertekliaus", 6),
    ("Dietary approaches", "mediterranean week", "Viduržemio savaitė", "patiekalai pagal tavo skonį", 5),
    ("Dietary approaches", "vegan protein", "Vegan baltymai", "balansas kiekvienai dienai", 0),
    ("Dietary approaches", "keto family", "Keto šeimai", "meniu pagal apribojimus", 5),
    ("Dietary approaches", "gluten dairy free", "Be gliadino ir pieno", "filtruojami ingredientai", 6),
    ("Lifestyle & convenience", "instant pot", "Greitas puodas", "patiekalai pagal trumpą laiką", 0),
    ("Lifestyle & convenience", "lunch prep five", "Penki pietūs", "porcijos kiekvienai darbo dienai", 0),
    ("Lifestyle & convenience", "ten minute meals", "Dešimt minučių", "receptai pagal rutiną", 0),
    ("Lifestyle & convenience", "cooking for guests", "Svečiai namuose", "struktūra palieka vietos renginiui", 2),
    ("Emotional & psychological", "Sunday scaries food", "Sekmadienio nerimas", "pirmadienis prasideda su planu", 0),
    ("Emotional & psychological", "Monday motivation food", "Pirmadienio startas", "savaitė jau suplanuota", 6),
    ("Emotional & psychological", "Friday treat balance", "Penktadienio balansas", "struktūra aplink savaitgalį", 2),
    ("Emotional & psychological", "habit relapse", "Po nukrypimo", "planas veikia ir ne tobulomis dienomis", 4),
    ("Fitness & energy", "half marathon", "Pusmaratonis", "energija paskirstyta per dieną", 0),
    ("Fitness & energy", "strength bulk", "Masės etapas", "porcijos pagal tavo tikslus", 0),
    ("Fitness & energy", "yoga retreat", "Jogos savaitgalis", "lengvesni patiekalai plane", 5),
    ("Fitness & energy", "tennis days", "Teniso dienos", "patiekalai prieš ir po sporto", 0),
    ("Demographics", "women 30s", "Moterys trisdešimt", "planas pagal tavo etapą", 5),
    ("Demographics", "men 40s", "Vyrai keturiasdešimt", "tikslai atsižvelgiami į meniu", 5),
    ("Demographics", "seniors couple", "Senjorų pora", "paprasti receptai abiem", 0),
    ("Demographics", "young parents twins", "Dvynukai namuose", "greiti patiekalai trumpam laikui", 0),
    ("Seasonal hooks", "easter meals", "Velykų savaitė", "struktūra aplink šventes", 2),
    ("Seasonal hooks", "summer travel", "Vasaros kelionės", "rutina grįžus namo", 1),
    ("Seasonal hooks", "winter soups", "Žiemos sriubos", "sotūs patiekalai plane", 0),
    ("Seasonal hooks", "spring detox", "Pavasario lengvumas", "švelnus resetas be ekstremumų", 0),
    ("Wellness-adjacent", "gut brain axis", "Gut ir galva", "pastovesnė kasdienybė", 1),
    ("Wellness-adjacent", "mood food", "Nuotaika ir maistas", "mažiau chaotiškų sprendimų", 2),
    ("Wellness-adjacent", "afternoon focus", "Popietės fokusas", "energija be kritimo", 2),
    ("Wellness-adjacent", "evening wind down", "Vakaro ramybė", "vakarienės pagal rutiną", 0),
    ("Objections & pain points", "tried meal kits", "Bandėte meal kit", "vienkartinis planas vietoj prenumeratos", 4),
    ("Objections & pain points", "tried influencers", "Bandėte influencerius", "vienas planas pagal tavo duomenis", 5),
    ("Objections & pain points", "no meal ideas", "Nėra idėjų", "konkretūs receptai kiekvienai dienai", 6),
    ("Objections & pain points", "hate meal prep", "Nemėgsti meal prep", "planavimas atliktas už tave", 4),
    ("Transformation & social proof", "six month streak", "Šeši mėnesiai", "vienas planas veikia kas savaitę", 4),
    ("Transformation & social proof", "friend recommended", "Draugė rekomendavo", "asmeninis planas pagal tavo duomenis", 5),
    ("Transformation & social proof", "instagram saved", "Išsaugojau postą", "pagaliau turiu savo planą", 1),
    ("Transformation & social proof", "reused ingredients", "Ingredientai panaudoti", "mažiau maisto išmetu", 3),
    ("Save money & budget", "weekly 40 euro", "40 eurų savaitė", "biudžetui draugiški receptai", 0),
    ("Save money & budget", "stop food delivery", "Mažiau pristatymų", "žinai vakarienės receptą", 6),
    ("Save money & budget", "warehouse shop", "Didelis apsipirkimas", "planas panaudoja kiekius be švaistymo", 3),
    ("Save money & budget", "price rise adapt", "Brangėjimo adaptacija", "biudžetui draugiški ingredientai", 0),
    ("Reduce food waste", "wilted salad", "Salotos laiku", "ingredientai paskirstyti per savaitę", 3),
    ("Reduce food waste", "half onion left", "Svogūnas iki galo", "naudojamas keliuose patiekaluose", 3),
    ("Reduce food waste", "extra rice use", "Ryžiai iki galo", "suplanuotas keliuose receptuose", 3),
    ("Reduce food waste", "cream before expiry", "Grietinė laiku", "panaudojama pagal planą", 6),
    ("Planning & personalisation", "quiz five minutes", "Penkių minučių testas", "planas formuojamas pagal atsakymus", 4),
    ("Planning & personalisation", "email pdf plan", "PDF el. paštu", "gauni asmeninį planą per 24 val.", 4),
    ("Planning & personalisation", "update preferences", "Atnaujinti pageidavimus", "planas keičiasi su tavimi", 5),
    ("Planning & personalisation", "one time no sub", "Be prenumeratos", "sumoki vieną kartą už planą", 4),
]
for cat, theme, hook, clause, tmpl in _TOPUP:
    _expand_category(cat, [(theme, hook, clause, tmpl)])


def fix_body(body: str) -> str:
    if "Tavo knyga" in body:
        return body.strip()
    stripped = body.strip()
    if stripped.lower().startswith("planas "):
        return f'"Tavo knyga" {stripped[0].lower() + stripped[1:]}'
    return f'"Tavo knyga" padeda taip, kad {stripped[0].lower() + stripped[1:] if stripped else stripped}'


def _word_count(text: str) -> int:
    return len(re.findall(r"\S+", text))


def validate_entry(theme: str, hook: str, body: str) -> list[str]:
    issues: list[str] = []
    hw = _word_count(hook)
    if hw < 2 or hw > 5:
        issues.append(f"hook word count {hw}: {hook!r}")
    if "Tavo knyga" not in body:
        issues.append(f"missing Tavo knyga: {theme!r}")
    if _word_count(body) > 32:
        issues.append(f"body too long ({_word_count(body)} words): {theme!r}")
    if "!" in hook or "!" in body:
        issues.append(f"exclamation: {theme!r}")
    if re.search(r"[\U0001F300-\U0001FAFF]", hook + body):
        issues.append(f"emoji: {theme!r}")
    return issues


def build_pool() -> dict:
    categories: dict[str, list[dict]] = {}
    all_issues: list[str] = []
    total = 0
    for cat, entries in POOL.items():
        rows: list[dict] = []
        seen_hooks: set[str] = set()
        for theme, hook, body in entries:
            body = fix_body(body)
            issues = validate_entry(theme, hook, body)
            if issues:
                all_issues.extend(issues)
            hook_key = hook.strip().lower()
            if hook_key in seen_hooks:
                all_issues.append(f"duplicate hook in {cat}: {hook!r}")
            seen_hooks.add(hook_key)
            rows.append({
                "theme": theme,
                "hook": hook.strip(),
                "body": fix_body(body),
            })
        categories[cat] = rows
        total += len(rows)
    if all_issues:
        print(f"WARNINGS: {len(all_issues)} (see validate_entry)")
    print(f"Total entries: {total} across {len(categories)} categories")
    return {
        "version": 1,
        "product": "tavoknyga.com",
        "language": "lt-LT",
        "format": "hook_body",
        "total": total,
        "categories": categories,
    }


def main() -> None:
    data = build_pool()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
