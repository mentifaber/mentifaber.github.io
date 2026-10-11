/* Worm Eater · the ingredient table. Each entry: rating (ok · mid · bad) and the stated reason. Anything not in here is
   UNCLASSIFIED and is shown as such: it never quietly counts as fine. Names are matched after lower-casing and
   stripping percentages and brackets; E-numbers map to their names. Reasons are kept short and measured: what it is,
   and why it sits where it does. Not medical advice. */
window.WE_TABLE = (() => {
  const T = {};
  const add = (rating, names, why) => names.split("|").forEach((n) => (T[n.trim()] = { r: rating, why }));
  // ── basics ──
  add("ok", "water|aqua|eau", "Water.");
  add("ok", "whole wheat flour|whole grain wheat flour|wholemeal flour|whole grain oats|oats|rolled oats|oat flour|brown rice|whole grain rice|quinoa|barley|rye flour|whole grain corn", "A whole grain: the bran and germ are still there.");
  add("mid", "enriched flour|wheat flour|enriched wheat flour|white flour|bleached flour|unbleached enriched flour|refined wheat flour", "Refined: stripped of bran and germ, then partly re-fortified. Not harmful, not the same as the whole grain.");
  add("ok", "rice|rice flour|corn|corn flour|cornmeal|potatoes|potato|potato starch|tapioca|tapioca starch|corn starch|cornstarch", "A plain starch or staple.");
  add("mid", "modified corn starch|modified food starch|modified starch|modified tapioca starch", "Starch altered to behave better in processing. Safe; a marker of a more processed food.");
  add("ok", "milk|whole milk|skim milk|skimmed milk|milk powder|nonfat milk|cream|yogurt|cultured milk|cheese|eggs|egg|egg whites|egg yolk|butter|ghee", "A whole food or dairy staple.");
  add("ok", "olive oil|extra virgin olive oil|avocado oil|coconut oil|sunflower oil|high oleic sunflower oil|canola oil|rapeseed oil|peanut oil|sesame oil|safflower oil|soybean oil|corn oil|vegetable oil", "A common cooking oil. Fine in normal amounts.");
  add("mid", "palm oil|palm kernel oil|palm fat|vegetable fat (palm)|fractionated palm kernel oil", "Saturated fat, and a supply chain with real deforestation problems unless certified sourcing is stated.");
  add("bad", "partially hydrogenated oil|partially hydrogenated soybean oil|partially hydrogenated vegetable oil|hydrogenated vegetable oil|shortening (partially hydrogenated)", "Industrial trans fat: raises LDL and lowers HDL. The US removed it from the safe list in 2018.");
  add("mid", "hydrogenated oil|fully hydrogenated oil|interesterified fat", "Hardened fat. Fully hydrogenated has little trans fat, but it's a heavily processed fat.");
  add("mid", "salt|sea salt|sodium chloride", "Fine in itself; the amount is what matters, and packaged food is where most salt comes from.");
  add("ok", "baking soda|sodium bicarbonate|baking powder|yeast|sourdough|leavening", "A leavening agent.");
  add("ok", "vinegar|apple cider vinegar|lemon juice|lime juice", "An acid for flavour and keeping.");
  add("ok", "spices|herbs|garlic|onion|garlic powder|onion powder|paprika|black pepper|pepper|cinnamon|turmeric|ginger|cumin|basil|oregano|parsley|chili|chilli", "A spice or aromatic.");
  add("ok", "tomatoes|tomato|tomato paste|carrots|spinach|peas|beans|lentils|chickpeas|almonds|peanuts|walnuts|cashews|hazelnuts|raisins|apples|bananas|strawberries|blueberries|cocoa|cocoa powder|cocoa mass|cocoa butter|vanilla|vanilla extract", "A whole food.");
  // ── sugars and sweeteners ──
  add("mid", "sugar|cane sugar|brown sugar|beet sugar|raw sugar|honey|maple syrup|molasses|agave|agave syrup|dextrose|glucose|glucose syrup|fructose|invert sugar|maltose|rice syrup|brown rice syrup|corn syrup|corn syrup solids|caramel|malt extract|barley malt", "Added sugar. Fine as a treat; how high it sits on the list tells you how much is in there.");
  add("bad", "high fructose corn syrup|glucose-fructose syrup|fructose-glucose syrup|isoglucose", "Added sugar in a form the liver handles differently from glucose. High on a list, it's a main ingredient.");
  add("mid", "maltodextrin", "A fast-digesting starch used as filler and thickener. Spikes blood sugar like sugar does.");
  add("mid", "aspartame", "Low-calorie sweetener. Within limits it's approved, but IARC listed it as 'possibly carcinogenic' (2B) in 2023 on limited evidence.");
  add("mid", "sucralose", "Low-calorie sweetener. Approved; some studies question its effects on gut bacteria and on heating.");
  add("mid", "acesulfame potassium|acesulfame k|acesulfame-k", "Low-calorie sweetener, usually paired with others. Approved; long-term data is thinner than for sugar.");
  add("mid", "saccharin", "The oldest artificial sweetener. Approved; its old cancer warning was withdrawn.");
  add("ok", "stevia|steviol glycosides|stevia leaf extract|rebaudioside a|monk fruit|monk fruit extract", "A plant-derived sweetener with no calories.");
  add("mid", "erythritol", "Sugar alcohol. Generally tolerated; a 2023 study linked high blood levels to clotting risk, not yet settled.");
  add("mid", "sorbitol|maltitol|xylitol|isomalt|mannitol", "Sugar alcohol. Fewer calories, but a laxative in larger amounts (and xylitol is toxic to dogs).");
  // ── texture and keeping ──
  add("ok", "lecithin|soy lecithin|sunflower lecithin", "Emulsifier. Well studied, no meaningful concern at food levels.");
  add("ok", "xanthan gum|guar gum|locust bean gum|gellan gum|pectin|agar|gum arabic|acacia gum|tara gum|konjac", "A plant or fermentation thickener. Inert at food levels.");
  add("mid", "carrageenan", "Seaweed thickener. Approved; animal studies raise gut-inflammation questions that human data hasn't settled.");
  add("mid", "mono- and diglycerides|mono and diglycerides|mono and diglycerides of fatty acids|monoglycerides|diglycerides", "Emulsifier that can carry small amounts of trans fat not counted on the label.");
  add("mid", "polysorbate 80|polysorbate 60|polysorbate 20|carboxymethylcellulose|cellulose gum|sodium carboxymethylcellulose", "Synthetic emulsifier. Approved; mouse studies link it to gut-lining changes, human evidence is early.");
  add("ok", "citric acid|ascorbic acid|vitamin c|tocopherols|mixed tocopherols|vitamin e|rosemary extract|lactic acid|malic acid|calcium chloride|calcium carbonate|potassium chloride", "A mild acid, vitamin or mineral used to keep or balance flavour.");
  add("mid", "sodium benzoate|potassium benzoate|benzoic acid", "Preservative. Safe at approved levels; with vitamin C and heat it can form traces of benzene.");
  add("ok", "potassium sorbate|sorbic acid|calcium propionate|sodium propionate", "Preservative with a long, unremarkable safety record.");
  add("bad", "bha|butylated hydroxyanisole", "Synthetic antioxidant. Listed as 'reasonably anticipated to be a human carcinogen' by the US NTP.");
  add("mid", "bht|butylated hydroxytoluene", "Synthetic antioxidant. Approved; evidence is mixed, and some makers have dropped it.");
  add("bad", "tbhq|tert-butylhydroquinone|tertiary butylhydroquinone", "Synthetic preservative with a regulated upper limit. Legal at the doses used, and the reason the limit exists is not nothing.");
  add("bad", "potassium bromate", "Flour improver banned in the EU, UK, Canada and elsewhere as a possible carcinogen. Still legal in most of the US.");
  add("bad", "azodicarbonamide", "Dough conditioner banned in the EU; it breaks down into compounds of concern when baked.");
  add("bad", "brominated vegetable oil|bvo", "Drink emulsifier; the US revoked its approval in 2024.");
  add("mid", "sodium nitrite|sodium nitrate|potassium nitrite|potassium nitrate|celery powder", "Curing salt for meats. Prevents botulism, but processed meat itself is linked to colorectal cancer. 'Celery powder' is the same chemistry.");
  add("mid", "phosphoric acid|tripotassium phosphate|dipotassium phosphate|monocalcium phosphate|calcium phosphate|tricalcium phosphate|sodium phosphate|disodium phosphate|trisodium phosphate|sodium tripolyphosphate|sodium aluminum phosphate|tetrasodium pyrophosphate", "Added phosphate. Fine for most people; a concern in quantity for kidney health.");
  add("ok", "monosodium glutamate|msg|glutamate|yeast extract|autolyzed yeast extract", "Savoury flavour. Decades of study found no meaningful harm at food levels.");
  add("ok", "disodium inosinate|disodium guanylate", "Savoury flavour enhancer, used with MSG.");
  // ── colours and flavours ──
  add("bad", "red 40|allura red|allura red ac|e129|yellow 5|tartrazine|e102|yellow 6|sunset yellow|sunset yellow fcf|e110|red 3|erythrosine|e127|blue 1|brilliant blue|e133|blue 2|indigo carmine|e132", "Petroleum-derived colour. Warning-labelled in the EU for children's attention; Red 3 is being phased out in the US.");
  add("mid", "caramel color|caramel colour|e150d|e150c|caramel colour (e150d)", "Colouring. Classes III and IV can contain 4-MEI, which California lists under Prop 65.");
  add("bad", "titanium dioxide|e171", "Whitening agent no longer allowed in food in the EU since 2022 over DNA-damage concerns. (As a mineral sunscreen on skin, it's different.)");
  add("ok", "beet juice|beetroot red|paprika extract|annatto|turmeric extract|curcumin|spirulina extract|carmine|anthocyanins|beta carotene|beta-carotene|carotene", "A colour from a plant, insect or mineral source.");
  add("unk", "natural flavors|natural flavor|natural flavour|natural flavours|flavoring|flavouring|flavor|flavour|artificial flavor|artificial flavors|artificial flavour|artificial flavours|aroma|aromas", "A legal category, not an ingredient. It could be almost anything, and the label doesn't have to say. The biggest hole in every scanner, including this one.");
  // ── personal care ──
  add("ok", "glycerin|glycerine|glycerol", "Humectant. Draws water into the skin.");
  add("ok", "aloe vera|aloe barbadensis leaf juice|shea butter|butyrospermum parkii butter|jojoba oil|simmondsia chinensis seed oil|squalane|hyaluronic acid|sodium hyaluronate|niacinamide|panthenol|allantoin|ceramide np|ceramides|zinc oxide|cetearyl alcohol|cetyl alcohol|stearyl alcohol|caprylic/capric triglyceride", "A well-tolerated moisturiser, soother or mineral.");
  add("mid", "sodium lauryl sulfate|sls|sodium laureth sulfate|sles|ammonium lauryl sulfate", "Strong cleanser. Safe, but a known irritant for sensitive skin and scalps.");
  add("mid", "cocamidopropyl betaine", "Mild cleanser from coconut oil. Occasional allergen.");
  add("mid", "methylparaben|ethylparaben|propylparaben|butylparaben|parabens", "Preservative. Approved at low levels; weak hormone-like activity is why the longer-chain ones are restricted in the EU.");
  add("bad", "dmdm hydantoin|imidazolidinyl urea|diazolidinyl urea|quaternium-15|bronopol|2-bromo-2-nitropropane-1,3-diol", "Formaldehyde-releasing preservative. A known sensitiser, increasingly restricted.");
  add("bad", "triclosan|triclocarban", "Antibacterial banned from US consumer soaps in 2016: no proven benefit, and concerns about hormones and resistance.");
  add("bad", "phthalates|diethyl phthalate|dep|dibutyl phthalate|dbp", "Plasticiser linked to hormone disruption. Restricted in cosmetics in the EU.");
  add("mid", "oxybenzone|benzophenone-3|octinoxate|ethylhexyl methoxycinnamate|homosalate|octocrylene", "Chemical UV filter. Effective; absorbed into the body, with open questions about hormones and reefs.");
  add("mid", "peg-100 stearate|peg-40 hydrogenated castor oil|polyethylene glycol|peg|peg compounds", "PEG compound: helps things mix and penetrate. Low concern itself; can carry trace contaminants from manufacture.");
  add("ok", "mineral oil|paraffinum liquidum|petrolatum|white petrolatum", "Cosmetic-grade petroleum emollient: highly refined and well tolerated.");
  add("unk", "fragrance|parfum|perfume", "A trade secret: one word that can stand for dozens of undisclosed chemicals. A common cause of skin reactions.");
  add("mid", "alcohol denat|denatured alcohol|sd alcohol|alcohol", "Drying solvent. Fine in sprays and toners; harsh on dry skin.");
  add("mid", "retinol|retinyl palmitate|salicylic acid|glycolic acid", "Active ingredient: effective, but irritating for some and not for use in pregnancy (retinoids).");
  // E-numbers to names (the common ones)
  const E = { e100: "turmeric extract", e101: "riboflavin", e120: "carmine", e140: "chlorophyll", e150a: "caramel color", e160a: "beta carotene", e160b: "annatto", e160c: "paprika extract", e162: "beetroot red", e163: "anthocyanins",
    e200: "sorbic acid", e202: "potassium sorbate", e210: "benzoic acid", e211: "sodium benzoate", e212: "potassium benzoate", e220: "sulfur dioxide", e250: "sodium nitrite", e251: "sodium nitrate", e252: "potassium nitrate", e270: "lactic acid", e281: "sodium propionate", e282: "calcium propionate",
    e296: "malic acid", e300: "ascorbic acid", e306: "tocopherols", e307: "tocopherols", e319: "tbhq", e320: "bha", e321: "bht", e322: "lecithin", e330: "citric acid", e338: "phosphoric acid", e339: "sodium phosphate", e341: "sodium phosphate", e406: "agar", e407: "carrageenan", e410: "locust bean gum", e412: "guar gum", e414: "gum arabic",
    e415: "xanthan gum", e418: "gellan gum", e420: "sorbitol", e421: "mannitol", e422: "glycerin", e433: "polysorbate 80", e440: "pectin", e450: "tetrasodium pyrophosphate", e466: "carboxymethylcellulose", e471: "mono- and diglycerides", e500: "sodium bicarbonate", e503: "baking soda", e509: "calcium chloride", e621: "monosodium glutamate",
    e627: "disodium guanylate", e631: "disodium inosinate", e950: "acesulfame potassium", e951: "aspartame", e954: "saccharin", e955: "sucralose", e960: "steviol glycosides", e965: "maltitol", e967: "xylitol", e968: "erythritol", e1422: "modified starch", e1442: "modified starch", e1450: "modified starch" };
  add("mid", "sulfur dioxide|sulphur dioxide|sulfites|sulphites|sodium metabisulfite|potassium metabisulfite", "Preservative in wine and dried fruit. Can trigger reactions in people with asthma.");
  add("ok", "vanillin|ethyl vanillin", "Vanilla's flavour compound, made rather than extracted. Well studied.");
  add("mid", "caffeine", "A stimulant. Fine in moderation; worth knowing it's there, especially for children.");
  add("unk", "flavourings|flavorings|natural flavourings|natural flavorings|natural flavouring|natural flavoring", "A legal category, not an ingredient. It could be almost anything, and the label doesn't have to say.");
  add("ok", "carbonated water|sparkling water|mineral water", "Water.");
  add("ok", "riboflavin|chlorophyll|vitamin a|vitamin d|vitamin d3|vitamin b12|folic acid|niacin|thiamine|iron|zinc|calcium", "A vitamin or mineral.");
  return { T, E };
})();
