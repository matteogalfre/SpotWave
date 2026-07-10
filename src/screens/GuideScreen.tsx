import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useI18n, Locale } from '../i18n';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { GuideScreenProps } from '../navigation/types';
import { MCIName } from '../utils/icons';
import { scoreColor } from '../theme';
import { spacing, radius, typography, touchTarget } from '../utils/tokens';

type LS = Partial<Record<Locale, string>> & { en: string };
const L = (
  fr: string, en: string, es: string, pt: string, de: string, it: string, ja: string,
): LS => ({ fr, en, es, pt, de, it, ja });
const pick = (m: LS, l: Locale): string => m[l] ?? m.en;

// Colours come straight from the app's score ramp (scoreColor) so the guide can
// never drift from what users actually see on cards and the map.
const scoreRows: { range: string; label: LS; icon: MCIName; color: string }[] = [
  { range: '9.0 – 10', label: L('Parfait (rare)', 'Perfect (rare)', 'Perfecto (raro)', 'Perfeito (raro)', 'Perfekt (selten)', 'Perfetto (raro)', '完璧（まれ）'), icon: 'fire', color: scoreColor(9.5) },
  { range: '7.5 – 8.9', label: L('On fonce', "Let's go", 'A por ello', 'Bora', 'Los geht’s', 'Si va', '行こう'), icon: 'thumb-up', color: scoreColor(8.2) },
  { range: '6.0 – 7.4', label: L('Correct', 'Decent', 'Aceptable', 'Aceitável', 'Solide', 'Discreto', 'まずまず'), icon: 'thumb-up-outline', color: scoreColor(6.7) },
  { range: '4.5 – 5.9', label: L('Moyen', 'Average', 'Regular', 'Médio', 'Mittel', 'Nella media', '普通'), icon: 'emoticon-neutral-outline', color: scoreColor(5.2) },
  { range: '2.5 – 4.4', label: L('Mauvais', 'Bad', 'Malo', 'Mau', 'Schlecht', 'Scarso', '悪い'), icon: 'thumb-down-outline', color: scoreColor(3.4) },
  { range: '0 – 2.4', label: L('Flat / nul', 'Flat / awful', 'Plano / nulo', 'Flat / nulo', 'Flat / mies', 'Flat / pessimo', 'フラット/最悪'), icon: 'cancel', color: scoreColor(1.2) },
];

const windTerms: { term: string; desc: LS; icon: MCIName; good: boolean }[] = [
  { term: 'Offshore', icon: 'weather-windy', good: true, desc: L(
    'Vent venant de la terre vers la mer. Lisse les vagues, conditions idéales.',
    'Wind blowing from land to sea. Smooths waves, ideal conditions.',
    'Viento de tierra hacia el mar. Alisa las olas, condiciones ideales.',
    'Vento de terra para o mar. Alisa as ondas, condições ideais.',
    'Wind vom Land aufs Meer. Glättet die Wellen, ideale Bedingungen.',
    'Vento da terra verso il mare. Leviga le onde, condizioni ideali.',
    '陸から海へ吹く風。波を整える理想的なコンディション。') },
  { term: 'Cross-off', icon: 'arrow-top-right', good: true, desc: L(
    'Vent latéral tendance offshore. Bonnes conditions, léger clapot possible.',
    'Side-wind tending offshore. Good conditions, slight chop possible.',
    'Viento lateral con tendencia offshore. Buenas condiciones, posible ligero picado.',
    'Vento lateral com tendência offshore. Boas condições, possível ligeiro choppy.',
    'Seitenwind mit Offshore-Tendenz. Gute Bedingungen, leichtes Kabbeln möglich.',
    'Vento laterale con tendenza offshore. Buone condizioni, possibile leggero movimento.',
    'オフショア寄りの横風。良好なコンディション、軽いチョップの可能性。') },
  { term: 'Cross-on', icon: 'arrow-bottom-right', good: false, desc: L(
    'Vent latéral tendance onshore. Surface perturbée, vagues moins propres.',
    'Side-wind tending onshore. Disrupted surface, messier waves.',
    'Viento lateral con tendencia onshore. Superficie alterada, olas menos limpias.',
    'Vento lateral com tendência onshore. Superfície perturbada, ondas menos limpas.',
    'Seitenwind mit Onshore-Tendenz. Gestörte Oberfläche, weniger saubere Wellen.',
    'Vento laterale con tendenza onshore. Superficie disturbata, onde meno pulite.',
    'オンショア寄りの横風。海面が乱れ、波のクオリティが落ちる。') },
  { term: 'Onshore', icon: 'weather-windy', good: false, desc: L(
    'Vent venant de la mer vers la terre. Surface hachée, mauvaises conditions.',
    'Wind blowing from sea to land. Choppy surface, poor conditions.',
    'Viento del mar hacia tierra. Superficie picada, malas condiciones.',
    'Vento do mar para a terra. Superfície picada, más condições.',
    'Wind vom Meer aufs Land. Kabbelige Oberfläche, schlechte Bedingungen.',
    'Vento dal mare verso terra. Superficie mossa, condizioni scadenti.',
    '海から陸へ吹く風。海面がチョッピーになり、コンディション不良。') },
  { term: 'Glassy', icon: 'water', good: true, desc: L(
    'Quasiment pas de vent (< 5 km/h). Surface vitreuse = score vent parfait (1.0). Les meilleures conditions possibles.',
    'Almost no wind (< 5 km/h). Glassy surface = perfect wind score (1.0). The best possible conditions.',
    'Casi sin viento (< 5 km/h). Superficie cristalina = puntuación de viento perfecta (1.0). Las mejores condiciones posibles.',
    'Quase sem vento (< 5 km/h). Superfície glassy = pontuação de vento perfeita (1.0). As melhores condições possíveis.',
    'Fast kein Wind (< 5 km/h). Glatte Oberfläche = perfekter Wind-Score (1.0). Die besten Bedingungen überhaupt.',
    'Quasi assenza di vento (< 5 km/h). Superficie vetrata = punteggio vento perfetto (1.0). Le migliori condizioni possibili.',
    'ほぼ無風（< 5 km/h）。ガラス面＝風スコア満点（1.0）。最高のコンディション。') },
];

const factors: { icon: MCIName; title: LS; desc: LS }[] = [
  { icon: 'waves',
    title: L('Houle (hauteur × période × direction)', 'Swell (height × period × direction)', 'Oleaje (altura × periodo × dirección)', 'Ondulação (altura × período × direção)', 'Swell (Höhe × Periode × Richtung)', 'Swell (altezza × periodo × direzione)', 'スウェル（高さ×周期×向き）'),
    desc: L(
      'Le pilier #1. La hauteur est comparée à l\'idéal du spot et ton niveau. La période pèse 35% du score houle — c\'est elle qui sépare le vrai surf du clapot. Un bonus "puissance" récompense les combinaisons hauteur × longue période (ex : 1.5m @ 14s >> 2m @ 7s).',
      'Pillar #1. Height compared to spot ideal and your level. Period weighs 35% of the swell score — it separates real surf from chop. A "power" bonus rewards height × long period combos (e.g. 1.5m @ 14s >> 2m @ 7s).',
      'El pilar n.º1. La altura se compara con el ideal del spot y tu nivel. El periodo pesa un 35% de la puntuación de oleaje — es lo que separa el surf real del picado. Un bonus de "potencia" premia las combinaciones altura × periodo largo (ej.: 1.5m @ 14s >> 2m @ 7s).',
      'O pilar n.º1. A altura é comparada com o ideal do spot e o teu nível. O período pesa 35% da pontuação de ondulação — é o que separa o surf a sério do choppy. Um bónus de "potência" premeia as combinações altura × período longo (ex.: 1.5m @ 14s >> 2m @ 7s).',
      'Säule Nr. 1. Die Höhe wird mit dem Ideal des Spots und deinem Level verglichen. Die Periode macht 35% des Swell-Scores aus — sie trennt echtes Surfen vom Kabbelwasser. Ein „Kraft"-Bonus belohnt Höhe × lange Periode (z. B. 1.5m @ 14s >> 2m @ 7s).',
      'Pilastro n.1. L\'altezza è confrontata con l\'ideale dello spot e il tuo livello. Il periodo pesa il 35% del punteggio swell — separa il vero surf dal mare mosso. Un bonus "potenza" premia le combinazioni altezza × periodo lungo (es. 1.5m @ 14s >> 2m @ 7s).',
      '第1の柱。高さはスポットの理想値とあなたのレベルと比較されます。周期はスウェルスコアの35%を占め、本物の波とチョップを分けます。「パワー」ボーナスは高さ×長い周期の組み合わせを評価します（例：1.5m @ 14s >> 2m @ 7s）。') },
  { icon: 'weather-windy',
    title: L('Vent (vitesse, direction, rafales, tendance)', 'Wind (speed, direction, gusts, trend)', 'Viento (velocidad, dirección, rachas, tendencia)', 'Vento (velocidade, direção, rajadas, tendência)', 'Wind (Geschwindigkeit, Richtung, Böen, Tendenz)', 'Vento (velocità, direzione, raffiche, tendenza)', '風（速度・向き・突風・傾向）'),
    desc: L(
      'Pilier #2. Houle × Vent = la base. Glassy (< 5 km/h) = score parfait (1.0). Offshore léger = quasi parfait. Offshore fort (> 28 km/h) = pénalisé (spray, paddle impossible). Onshore = grosse pénalité. La tendance du vent est aussi prise en compte : un vent qui faiblit = bonus, qui monte = malus.',
      'Pillar #2. Swell × Wind = the base. Glassy (< 5 km/h) = perfect score (1.0). Light offshore = near-perfect. Strong offshore (> 28 km/h) = penalized (spray, impossible paddle). Onshore = big penalty. Wind trend also matters: dropping wind = bonus, rising = penalty.',
      'Pilar n.º2. Oleaje × Viento = la base. Glassy (< 5 km/h) = puntuación perfecta (1.0). Offshore flojo = casi perfecto. Offshore fuerte (> 28 km/h) = penalizado (spray, remada imposible). Onshore = gran penalización. La tendencia del viento también cuenta: viento que baja = bonus, que sube = penalización.',
      'Pilar n.º2. Ondulação × Vento = a base. Glassy (< 5 km/h) = pontuação perfeita (1.0). Offshore fraco = quase perfeito. Offshore forte (> 28 km/h) = penalizado (spray, remada impossível). Onshore = grande penalização. A tendência do vento também conta: vento a diminuir = bónus, a aumentar = penalização.',
      'Säule Nr. 2. Swell × Wind = die Basis. Glassy (< 5 km/h) = perfekter Score (1.0). Leicht offshore = fast perfekt. Starker Offshore (> 28 km/h) = bestraft (Spray, unmögliches Paddeln). Onshore = große Strafe. Auch die Wind-Tendenz zählt: abnehmender Wind = Bonus, zunehmender = Malus.',
      'Pilastro n.2. Swell × Vento = la base. Glassy (< 5 km/h) = punteggio perfetto (1.0). Offshore leggero = quasi perfetto. Offshore forte (> 28 km/h) = penalizzato (spray, pagaiata impossibile). Onshore = grande penalità. Conta anche la tendenza del vento: vento in calo = bonus, in aumento = malus.',
      '第2の柱。スウェル×風＝基礎。グラッシー（< 5 km/h）＝満点（1.0）。弱いオフショア＝ほぼ完璧。強いオフショア（> 28 km/h）＝減点（スプレー、パドル困難）。オンショア＝大きな減点。風の傾向も考慮：弱まる風＝加点、強まる風＝減点。') },
  { icon: 'flash',
    title: L('Interaction vent × taille de houle', 'Wind × swell height interaction', 'Interacción viento × tamaño del oleaje', 'Interação vento × tamanho da ondulação', 'Interaktion Wind × Swell-Höhe', 'Interazione vento × altezza swell', '風×スウェル高さの相互作用'),
    desc: L(
      'Le même vent cross/onshore est plus pénalisant sur une grosse houle (la face est plus exposée au clapot) que sur du 0.5m.',
      'The same cross/onshore wind is more damaging on bigger waves (larger face exposed to chop) than on 0.5m surf.',
      'El mismo viento cross/onshore penaliza más con oleaje grande (la cara está más expuesta al picado) que con 0.5m.',
      'O mesmo vento cross/onshore penaliza mais com ondulação grande (a face fica mais exposta ao choppy) do que com 0.5m.',
      'Derselbe Cross-/Onshore-Wind schadet großen Wellen mehr (größere, dem Kabbeln ausgesetzte Fläche) als 0.5m-Wellen.',
      'Lo stesso vento cross/onshore penalizza di più le onde grandi (faccia più esposta al mosso) rispetto a onde di 0.5m.',
      '同じクロス／オンショアの風は、0.5mの波より大きな波（面が広くチョップにさらされる）でより悪影響を与えます。') },
  { icon: 'sync',
    title: L('Propreté du swell', 'Swell cleanness', 'Limpieza del swell', 'Limpeza do swell', 'Sauberkeit des Swells', 'Pulizia dello swell', 'スウェルのクリーンさ'),
    desc: L(
      'Ratio wind swell / ground swell. Si le wind swell domine (> 70%), pénalité sévère. Si les houles se croisent (wind wave vs ground swell à > 90°), la surface est chaotique = malus. Swell pur sans ground swell = pénalité -22%.',
      'Wind swell / ground swell ratio. If wind swell dominates (> 70%), severe penalty. Crossing swells (wind wave vs ground swell > 90° apart) = chaotic surface = penalty. Pure wind swell with no ground swell = -22% penalty.',
      'Ratio wind swell / ground swell. Si el wind swell domina (> 70%), penalización severa. Si los swells se cruzan (wind wave vs ground swell a > 90°), la superficie es caótica = penalización. Swell puro sin ground swell = penalización -22%.',
      'Rácio wind swell / ground swell. Se o wind swell domina (> 70%), penalização severa. Se os swells se cruzam (wind wave vs ground swell a > 90°), a superfície fica caótica = penalização. Swell puro sem ground swell = penalização -22%.',
      'Verhältnis Windsee / Grundsee. Dominiert die Windsee (> 70%), harte Strafe. Kreuzen sich die Swells (Windwelle vs. Grundsee > 90°), wird die Oberfläche chaotisch = Malus. Reine Windsee ohne Grundsee = -22%.',
      'Rapporto wind swell / ground swell. Se il wind swell domina (> 70%), penalità severa. Se gli swell si incrociano (wind wave vs ground swell > 90°), superficie caotica = malus. Wind swell puro senza ground swell = -22%.',
      'ウィンドスウェル／グラウンドスウェルの比率。ウィンドスウェルが優勢（> 70%）だと大きな減点。スウェルが交差（風波とグラウンドスウェルが90°以上）すると海面が乱れて減点。グラウンドスウェルのない純粋なウィンドスウェル＝-22%。') },
  { icon: 'anchor',
    title: L('Marée (selon le type de fond)', 'Tide (by bottom type)', 'Marea (según el tipo de fondo)', 'Maré (segundo o tipo de fundo)', 'Gezeiten (je nach Bodentyp)', 'Marea (secondo il tipo di fondale)', '潮（底質による）'),
    desc: L(
      'Bonus/malus adapté au type de spot. Beach break : marée descendante expose les bancs de sable (+6%). Point break : montante sculpte la vague (+8%). Reef : montante = plus sûr (+6%), très basse = dangereux.',
      'Bonus/penalty adapted to spot type. Beach break: falling tide exposes sandbars (+6%). Point break: rising tide shapes the wave (+8%). Reef: rising = safer (+6%), very low = dangerous.',
      'Bonus/penalización adaptado al tipo de spot. Beach break: marea bajando expone los bancos de arena (+6%). Point break: marea subiendo esculpe la ola (+8%). Reef: subiendo = más seguro (+6%), muy baja = peligroso.',
      'Bónus/penalização adaptado ao tipo de spot. Beach break: maré a vazar expõe os bancos de areia (+6%). Point break: maré a encher molda a onda (+8%). Reef: a encher = mais seguro (+6%), muito baixa = perigoso.',
      'Bonus/Malus je nach Spot-Typ. Beach Break: ablaufende Gezeit legt Sandbänke frei (+6%). Point Break: auflaufende Gezeit formt die Welle (+8%). Reef: auflaufend = sicherer (+6%), sehr niedrig = gefährlich.',
      'Bonus/malus adattato al tipo di spot. Beach break: marea calante espone i banchi di sabbia (+6%). Point break: marea crescente modella l\'onda (+8%). Reef: crescente = più sicuro (+6%), molto bassa = pericoloso.',
      'スポットの種類に応じた加点／減点。ビーチブレイク：引き潮が砂州を露出（+6%）。ポイントブレイク：上げ潮が波を形成（+8%）。リーフ：上げ潮＝より安全（+6%）、極端な干潮＝危険。') },
  { icon: 'weather-hurricane',
    title: L('Courants marins', 'Ocean currents', 'Corrientes marinas', 'Correntes marítimas', 'Meeresströmungen', 'Correnti marine', '海流'),
    desc: L(
      'Des courants forts (> 0.5 m/s) rendent le paddle plus dur et créent de la dérive. Pénalité progressive jusqu\'à -25%.',
      'Strong currents (> 0.5 m/s) make paddling harder and cause drift. Progressive penalty up to -25%.',
      'Corrientes fuertes (> 0.5 m/s) dificultan la remada y crean deriva. Penalización progresiva hasta -25%.',
      'Correntes fortes (> 0.5 m/s) dificultam a remada e criam deriva. Penalização progressiva até -25%.',
      'Starke Strömungen (> 0.5 m/s) erschweren das Paddeln und verursachen Abdrift. Progressive Strafe bis -25%.',
      'Correnti forti (> 0.5 m/s) rendono più difficile la pagaiata e causano deriva. Penalità progressiva fino a -25%.',
      '強い海流（> 0.5 m/s）はパドルを難しくし、流されの原因に。最大-25%の段階的減点。') },
  { icon: 'weather-rainy',
    title: L('Météo', 'Weather', 'Clima', 'Meteo', 'Wetter', 'Meteo', '天気'),
    desc: L(
      'Pluie forte et orages réduisent le score (jusqu\'à -30%). Le confort et la visibilité comptent.',
      'Heavy rain and storms reduce score (up to -30%). Comfort and visibility matter.',
      'Lluvia fuerte y tormentas reducen la puntuación (hasta -30%). El confort y la visibilidad cuentan.',
      'Chuva forte e trovoadas reduzem a pontuação (até -30%). O conforto e a visibilidade contam.',
      'Starker Regen und Gewitter senken den Score (bis zu -30%). Komfort und Sicht zählen.',
      'Pioggia forte e temporali riducono il punteggio (fino a -30%). Comfort e visibilità contano.',
      '強い雨や雷雨はスコアを下げます（最大-30%）。快適さと視界も重要。') },
  { icon: 'ruler',
    title: L('Stabilité de la houle', 'Swell stability', 'Estabilidad del oleaje', 'Estabilidade da ondulação', 'Stabilität des Swells', 'Stabilità dello swell', 'スウェルの安定性'),
    desc: L(
      'Direction constante = bonus (+5%). Direction chaotique (> 45° de variation) = malus (-15%).',
      'Constant direction = bonus (+5%). Chaotic direction (> 45° variation) = penalty (-15%).',
      'Dirección constante = bonus (+5%). Dirección caótica (> 45° de variación) = penalización (-15%).',
      'Direção constante = bónus (+5%). Direção caótica (> 45° de variação) = penalização (-15%).',
      'Konstante Richtung = Bonus (+5%). Chaotische Richtung (> 45° Schwankung) = Malus (-15%).',
      'Direzione costante = bonus (+5%). Direzione caotica (> 45° di variazione) = malus (-15%).',
      '一定の向き＝加点（+5%）。乱れた向き（45°以上の変動）＝減点（-15%）。') },
  { icon: 'target',
    title: L('Ton niveau', 'Your level', 'Tu nivel', 'O teu nível', 'Dein Level', 'Il tuo livello', 'あなたのレベル'),
    desc: L(
      'Débutant / Intermédiaire / Expert influence le score : spots trop engagés = pénalisés, spots adaptés = boostés.',
      'Beginner / Intermediate / Expert affects score: overly challenging spots = penalized, suited spots = boosted.',
      'Principiante / Intermedio / Avanzado influye en la puntuación: spots demasiado exigentes = penalizados, spots adecuados = potenciados.',
      'Iniciante / Intermédio / Avançado influencia a pontuação: spots demasiado exigentes = penalizados, spots adequados = potenciados.',
      'Anfänger / Fortgeschritten / Experte beeinflusst den Score: zu anspruchsvolle Spots = bestraft, passende Spots = gepusht.',
      'Principiante / Intermedio / Esperto influenza il punteggio: spot troppo impegnativi = penalizzati, spot adatti = valorizzati.',
      '初心者／中級者／上級者がスコアに影響：難しすぎるスポット＝減点、適したスポット＝加点。') },
  { icon: 'tune',
    title: L('Tes préférences', 'Your preferences', 'Tus preferencias', 'As tuas preferências', 'Deine Vorlieben', 'Le tue preferenze', 'あなたの好み'),
    desc: L(
      'Hauteur préférée : +10% si la houle correspond. Seules les heures dans ta plage dispo sont recommandées.',
      'Preferred height: +10% if swell matches. Only hours within your available range are recommended.',
      'Altura preferida: +10% si el oleaje coincide. Solo se recomiendan las horas dentro de tu franja disponible.',
      'Altura preferida: +10% se a ondulação corresponder. Só são recomendadas as horas dentro da tua faixa disponível.',
      'Bevorzugte Höhe: +10%, wenn der Swell passt. Nur Stunden innerhalb deines Zeitfensters werden empfohlen.',
      'Altezza preferita: +10% se lo swell corrisponde. Vengono consigliate solo le ore nella tua fascia disponibile.',
      '好みの高さ：スウェルが合えば+10%。利用可能な時間帯の中の時間のみおすすめされます。') },
];

// v2 scoring is continuous (no hard step caps): these are the strongest
// penalties that pull the score down, described by where they kick in.
const caps: { icon: MCIName; label: LS; desc: LS }[] = [
  { icon: 'cancel', label: L('Flat (houle < 0.3m)', 'Flat (swell < 0.3m)', 'Flat (oleaje < 0.3m)', 'Flat (ondulação < 0.3m)', 'Flat (Swell < 0.3m)', 'Flat (swell < 0.3m)', 'フラット（スウェル < 0.3m）'), desc: L('Score proche de 0', 'Score near 0', 'Puntuación cercana a 0', 'Pontuação perto de 0', 'Score nahe 0', 'Punteggio vicino a 0', 'スコアはほぼ0') },
  { icon: 'weather-windy', label: L('Onshore soutenu', 'Sustained onshore', 'Onshore sostenido', 'Onshore sustentado', 'Anhaltender Onshore', 'Onshore sostenuto', '持続的なオンショア'), desc: L('Forte pénalité dès ~12 km/h', 'Heavy penalty from ~12 km/h', 'Fuerte penalización desde ~12 km/h', 'Forte penalização a partir de ~12 km/h', 'Starke Strafe ab ~12 km/h', 'Forte penalità da ~12 km/h', '約12 km/hから大きな減点') },
  { icon: 'weather-windy', label: L('Offshore violent', 'Strong offshore', 'Offshore fuerte', 'Offshore forte', 'Starker Offshore', 'Offshore forte', '強いオフショア'), desc: L('Pénalisé au-delà de ~28 km/h (spray, paddle dur)', 'Penalized beyond ~28 km/h (spray, hard paddle)', 'Penalizado más allá de ~28 km/h (spray, remada dura)', 'Penalizado acima de ~28 km/h (spray, remada difícil)', 'Bestraft ab ~28 km/h (Spray, hartes Paddeln)', 'Penalizzato oltre ~28 km/h (spray, pagaiata dura)', '約28 km/h超で減点（スプレー、パドル困難）') },
  { icon: 'flash', label: L('Rafales fortes', 'Strong gusts', 'Rachas fuertes', 'Rajadas fortes', 'Starke Böen', 'Raffiche forti', '強い突風'), desc: L('Pénalisé au-delà de ~28 km/h', 'Penalized beyond ~28 km/h', 'Penalizado más allá de ~28 km/h', 'Penalizado acima de ~28 km/h', 'Bestraft ab ~28 km/h', 'Penalizzato oltre ~28 km/h', '約28 km/h超で減点') },
  { icon: 'timer-sand', label: L('Période courte (< 9s)', 'Short period (< 9s)', 'Periodo corto (< 9s)', 'Período curto (< 9s)', 'Kurze Periode (< 9s)', 'Periodo corto (< 9s)', '短い周期（< 9s）'), desc: L('Pénalité progressive (clapot, pas du vrai surf)', 'Progressive penalty (chop, not real surf)', 'Penalización progresiva (picado, no es surf real)', 'Penalização progressiva (choppy, não é surf a sério)', 'Progressive Strafe (Kabbeln, kein echtes Surfen)', 'Penalità progressiva (mare mosso, non vero surf)', '段階的な減点（チョップ、本物の波ではない）') },
  { icon: 'waves', label: L('Wind swell pur (pas de ground swell)', 'Pure wind swell (no ground swell)', 'Wind swell puro (sin ground swell)', 'Wind swell puro (sem ground swell)', 'Reine Windsee (keine Grundsee)', 'Wind swell puro (senza ground swell)', '純粋なウィンドスウェル（グラウンドスウェルなし）'), desc: L('Pénalité -22%', '-22% penalty', 'Penalización -22%', 'Penalização -22%', 'Strafe -22%', 'Penalità -22%', '減点 -22%') },
];

const terms: { term: LS; desc: LS }[] = [
  { term: L('Période', 'Period', 'Periodo', 'Período', 'Periode', 'Periodo', '周期'), desc: L('Temps entre 2 vagues (secondes). > 10s = puissant', 'Time between 2 waves (seconds). > 10s = powerful', 'Tiempo entre 2 olas (segundos). > 10s = potente', 'Tempo entre 2 ondas (segundos). > 10s = potente', 'Zeit zwischen 2 Wellen (Sekunden). > 10s = kraftvoll', 'Tempo tra 2 onde (secondi). > 10s = potente', '2つの波の間隔（秒）。> 10s＝パワフル') },
  { term: L('Swell', 'Swell', 'Swell', 'Swell', 'Swell', 'Swell', 'スウェル'), desc: L('Houle générée au large, plus propre que le wind swell', 'Ocean-generated waves, cleaner than wind swell', 'Oleaje generado mar adentro, más limpio que el wind swell', 'Ondulação gerada ao largo, mais limpa que o wind swell', 'Am offenen Meer erzeugte Dünung, sauberer als Windsee', 'Onda generata al largo, più pulita del wind swell', '沖で生まれるうねり。ウィンドスウェルよりクリーン') },
  { term: L('Beach break', 'Beach break', 'Beach break', 'Beach break', 'Beach break', 'Beach break', 'ビーチブレイク'), desc: L('Fond de sable, vagues changeantes', 'Sandy bottom, changing waves', 'Fondo de arena, olas cambiantes', 'Fundo de areia, ondas variáveis', 'Sandiger Boden, wechselhafte Wellen', 'Fondo di sabbia, onde variabili', '砂の底、変わりやすい波') },
  { term: L('Reef break', 'Reef break', 'Reef break', 'Reef break', 'Reef break', 'Reef break', 'リーフブレイク'), desc: L('Fond de roche/récif, vagues régulières', 'Rock/reef bottom, consistent waves', 'Fondo de roca/arrecife, olas regulares', 'Fundo de rocha/recife, ondas regulares', 'Fels-/Riffboden, gleichmäßige Wellen', 'Fondo di roccia/reef, onde regolari', '岩・リーフの底、安定した波') },
  { term: L('Point break', 'Point break', 'Point break', 'Point break', 'Point break', 'Point break', 'ポイントブレイク'), desc: L('Vague qui déroule le long d\'une pointe', 'Wave wrapping along a headland', 'Ola que rompe a lo largo de una punta', 'Onda que quebra ao longo de uma ponta', 'Welle, die entlang einer Landspitze abläuft', 'Onda che scorre lungo un promontorio', '岬に沿って割れる波') },
  { term: L('Shore break', 'Shore break', 'Shore break', 'Shore break', 'Shore break', 'Shore break', 'ショアブレイク'), desc: L('Vague qui casse directement sur le bord', 'Wave breaking directly on shore', 'Ola que rompe directamente en la orilla', 'Onda que quebra diretamente na margem', 'Welle, die direkt am Ufer bricht', 'Onda che frange direttamente a riva', '岸で直接割れる波') },
];

const SECT = {
  title: L('Comment ça marche ?', 'How does it work?', '¿Cómo funciona?', 'Como funciona?', 'Wie funktioniert es?', 'Come funziona?', '仕組みは？'),
  scoreCalc: L('Calcul du score', 'Score calculation', 'Cálculo de la puntuación', 'Cálculo da pontuação', 'Score-Berechnung', 'Calcolo del punteggio', 'スコアの計算'),
  intro: L(
    'Chaque heure reçoit un score de 0 à 10, calculé de façon multiplicative. Les deux piliers sont la houle et le vent : Houle × Vent = la base. Si l\'un est nul, tout le score descend. Ensuite, 8 facteurs ajustent la note : marée (adaptée au type de fond), propreté du swell, courants, tendance du vent, météo, stabilité, ton niveau et tes préférences. De fortes pénalités font chuter le score en cas de conditions deal-breaker.',
    'Each hour gets a 0-10 score, calculated multiplicatively. The two pillars are swell and wind: Swell × Wind = the base. If either is zero, the whole score drops. Then 8 factors adjust the score: tide (adapted to bottom type), swell cleanness, currents, wind trend, weather, consistency, your level and preferences. Strong penalties pull the score down when deal-breaker conditions apply.',
    'Cada hora recibe una puntuación de 0 a 10, calculada de forma multiplicativa. Los dos pilares son el oleaje y el viento: Oleaje × Viento = la base. Si uno es nulo, toda la puntuación baja. Luego, 8 factores ajustan la nota: marea (adaptada al tipo de fondo), limpieza del swell, corrientes, tendencia del viento, clima, estabilidad, tu nivel y tus preferencias. Fuertes penalizaciones hacen caer la puntuación ante condiciones deal-breaker.',
    'Cada hora recebe uma pontuação de 0 a 10, calculada de forma multiplicativa. Os dois pilares são a ondulação e o vento: Ondulação × Vento = a base. Se um for nulo, toda a pontuação desce. Depois, 8 fatores ajustam a nota: maré (adaptada ao tipo de fundo), limpeza do swell, correntes, tendência do vento, meteo, estabilidade, o teu nível e as tuas preferências. Fortes penalizações fazem cair a pontuação em condições deal-breaker.',
    'Jede Stunde erhält einen Score von 0 bis 10, multiplikativ berechnet. Die zwei Säulen sind Swell und Wind: Swell × Wind = die Basis. Ist eine davon null, sinkt der gesamte Score. Danach passen 8 Faktoren die Note an: Gezeiten (je nach Bodentyp), Sauberkeit des Swells, Strömungen, Wind-Tendenz, Wetter, Stabilität, dein Level und deine Vorlieben. Starke Strafen lassen den Score bei Deal-Breaker-Bedingungen fallen.',
    'Ogni ora riceve un punteggio da 0 a 10, calcolato in modo moltiplicativo. I due pilastri sono swell e vento: Swell × Vento = la base. Se uno è nullo, tutto il punteggio cala. Poi 8 fattori regolano il voto: marea (adattata al tipo di fondale), pulizia dello swell, correnti, tendenza del vento, meteo, stabilità, il tuo livello e le tue preferenze. Forti penalità fanno crollare il punteggio in condizioni deal-breaker.',
    '各時間に0〜10のスコアが乗算方式で計算されます。2つの柱はスウェルと風：スウェル×風＝基礎。どちらかが0だと全体のスコアが下がります。その後、8つの要素が評価を調整します：潮（底質に応じて）、スウェルのクリーンさ、海流、風の傾向、天気、安定性、あなたのレベルと好み。致命的な条件では強い減点でスコアが急落します。'),
  caps: L('Fortes pénalités', 'Strong penalties', 'Penalizaciones fuertes', 'Penalizações fortes', 'Starke Strafen', 'Penalità forti', '大きな減点'),
  scale: L('Échelle des scores', 'Score scale', 'Escala de puntuaciones', 'Escala de pontuações', 'Score-Skala', 'Scala dei punteggi', 'スコアの目安'),
  windGloss: L('Lexique du vent', 'Wind glossary', 'Glosario del viento', 'Glossário do vento', 'Wind-Glossar', 'Glossario del vento', '風の用語'),
  otherTerms: L('Autres termes', 'Glossary', 'Otros términos', 'Outros termos', 'Weitere Begriffe', 'Altri termini', 'その他の用語'),
};

export default function GuideScreen({ navigation }: GuideScreenProps) {
  const { colors } = useTheme();
  const { locale, t } = useI18n();

  const insets = useSafeAreaInsets();

  return (
    <ScrollView style={[gs.root, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
      <View style={[gs.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          style={[gs.back, { backgroundColor: colors.cardLight }]}
          accessibilityLabel={t.back}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.white} />
        </TouchableOpacity>
        <Text style={[gs.title, { color: colors.white }]} accessibilityRole="header">{pick(SECT.title, locale)}</Text>
      </View>

      <View style={gs.content}>
        <Text style={[gs.secTitle, { color: colors.accent }]}>{pick(SECT.scoreCalc, locale)}</Text>
        <Text style={[gs.desc, { color: colors.white70 }]}>{pick(SECT.intro, locale)}</Text>

        {factors.map((f, i) => (
          <View key={i} style={gs.factorRow}>
            <MaterialCommunityIcons name={f.icon} size={16} color={colors.accent} style={gs.factorIcon} />
            <View style={gs.factorInfo}>
              <Text style={[gs.factorTitle, { color: colors.white }]}>{pick(f.title, locale)}</Text>
              <Text style={[gs.factorDesc, { color: colors.white40 }]}>{pick(f.desc, locale)}</Text>
            </View>
          </View>
        ))}

        <View style={[gs.divider, { backgroundColor: colors.white15 }]} />

        <Text style={[gs.secTitle, { color: colors.accent }]}>{pick(SECT.caps, locale)}</Text>
        {caps.map((c, i) => (
          <View key={i} style={[gs.windRow, { backgroundColor: colors.redDim }]}>
            <MaterialCommunityIcons name={c.icon} size={16} color={colors.red} style={gs.windIcon} />
            <View style={gs.windInfo}>
              <Text style={[gs.windTerm, { color: colors.red }]}>{pick(c.label, locale)}</Text>
              <Text style={[gs.windDesc, { color: colors.white40 }]}>{pick(c.desc, locale)}</Text>
            </View>
          </View>
        ))}

        <View style={[gs.divider, { backgroundColor: colors.white15 }]} />

        <Text style={[gs.secTitle, { color: colors.accent }]}>{pick(SECT.scale, locale)}</Text>
        {scoreRows.map((r, i) => (
          <View key={i} style={gs.scoreRow}>
            <MaterialCommunityIcons name={r.icon} size={16} color={r.color} style={gs.scoreEmoji} />
            <Text style={[gs.scoreRange, { color: colors.white70 }]}>{r.range}</Text>
            <Text style={[gs.scoreLabel, { color: r.color }]}>{pick(r.label, locale)}</Text>
          </View>
        ))}

        <View style={[gs.divider, { backgroundColor: colors.white15 }]} />

        <Text style={[gs.secTitle, { color: colors.accent }]}>{pick(SECT.windGloss, locale)}</Text>
        {windTerms.map((w, i) => (
          <View key={i} style={[gs.windRow, { backgroundColor: w.good ? colors.accentDim : colors.redDim }]}>
            <MaterialCommunityIcons name={w.icon} size={16} color={w.good ? colors.accent : colors.red} style={gs.windIcon} />
            <View style={gs.windInfo}>
              <Text style={[gs.windTerm, { color: w.good ? colors.accent : colors.red }]}>{w.term}</Text>
              <Text style={[gs.windDesc, { color: colors.white40 }]}>{pick(w.desc, locale)}</Text>
            </View>
          </View>
        ))}

        <View style={[gs.divider, { backgroundColor: colors.white15 }]} />

        <Text style={[gs.secTitle, { color: colors.accent }]}>{pick(SECT.otherTerms, locale)}</Text>
        <View style={gs.termGrid}>
          {terms.map((tm, i) => (
            <View key={i} style={[gs.termItem, { backgroundColor: colors.white08 }]}>
              <Text style={[gs.termWord, { color: colors.white }]}>{pick(tm.term, locale)}</Text>
              <Text style={[gs.termDesc, { color: colors.white40 }]}>{pick(tm.desc, locale)}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const gs = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  back: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  title: { ...typography.h1, fontSize: 20, fontWeight: '900' },
  content: { paddingHorizontal: 20 },
  secTitle: { fontSize: 15, fontWeight: '800', marginTop: 20, marginBottom: 10 },
  desc: { fontSize: 13, lineHeight: 20, marginBottom: 12 },
  divider: { height: 1, marginVertical: 16, borderRadius: 1 },

  factorRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  factorIcon: { fontSize: 16, marginRight: 10, marginTop: 1 },
  factorInfo: { flex: 1 },
  factorTitle: { fontSize: 13, fontWeight: '700' },
  factorDesc: { fontSize: 12, lineHeight: 18, marginTop: 2 },

  scoreRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  scoreEmoji: { fontSize: 16, width: 28 },
  scoreRange: { width: 80, fontSize: 13, fontWeight: '700' },
  scoreLabel: { flex: 1, fontSize: 13, fontWeight: '600' },

  windRow: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12, padding: 12, marginBottom: 6 },
  windIcon: { fontSize: 16, marginRight: 10, marginTop: 1 },
  windInfo: { flex: 1 },
  windTerm: { fontSize: 13, fontWeight: '700' },
  windDesc: { fontSize: 12, lineHeight: 18, marginTop: 2 },

  termGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  termItem: { borderRadius: 10, padding: 10, flexBasis: '46%', flexGrow: 1 },
  termWord: { fontSize: 13, fontWeight: '800', marginBottom: 3 },
  termDesc: { fontSize: 11, lineHeight: 16 },
});
