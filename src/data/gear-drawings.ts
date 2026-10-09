// Stand-in drawings for the flat-lay: each item type seen from above, laid
// flat, in the same ink as the stand-in figures. 200 × 200 viewBox.
// Shapes with class "f" are filled white; everything else is ink line.
// Replaced automatically by a real cut-out when an item has an `image`.
import type { ItemType } from './gear-types';

const jacket = 'M78 38 L60 46 L34 112 L52 120 L64 92 L64 172 L136 172 L136 92 L148 120 L166 112 L140 46 L122 38 Z';

export const drawings: Record<ItemType, string> = {
  'rain-jacket': `
    <path class="f" d="${jacket}"/>
    <path class="f" d="M78 38 Q100 6 122 38 Q100 48 78 38 Z"/>
    <path d="M100 44 L100 172 M96 44 L96 172"/>
    <path d="M70 120 L90 120 M110 120 L130 120"/>`,
  'down-jacket': `
    <path class="f" d="${jacket}"/>
    <path d="M100 40 L100 172"/>
    <path d="M64 70 L136 70 M64 98 L136 98 M64 126 L136 126 M64 150 L136 150"/>
    <path d="M51 74 L60 78 M44 94 L56 99 M37 112 L50 117 M149 74 L140 78 M156 94 L144 99 M163 112 L150 117"/>
    <path d="M84 36 Q100 46 116 36"/>`,
  fleece: `
    <path class="f" d="${jacket}"/>
    <path class="f" d="M82 30 L118 30 L122 42 Q100 50 78 42 Z"/>
    <path d="M100 32 L100 84"/>
    <circle cx="100" cy="86" r="3"/>
    <path d="M64 160 L136 160"/>`,
  shirt: `
    <path class="f" d="M76 40 L56 48 L34 82 L54 94 L64 80 L64 172 L136 172 L136 80 L146 94 L166 82 L144 48 L124 40 Q100 58 76 40 Z"/>
    <path d="M86 46 Q100 56 114 46"/>`,
  pants: `
    <path class="f" d="M66 26 L134 26 L146 178 L110 178 L100 84 L90 178 L54 178 Z"/>
    <path d="M66 40 L134 40 M100 40 L100 84 M74 40 L72 60 M126 40 L128 60"/>`,
  socks: `
    <path class="f" d="M50 28 L80 28 L80 118 Q80 150 58 158 L42 160 Q30 156 34 142 Q40 132 50 126 Z"/>
    <path class="f" d="M112 40 L142 40 L142 130 Q142 162 120 170 L104 172 Q92 168 96 154 Q102 144 112 138 Z"/>
    <path d="M50 44 L80 44 M112 56 L142 56"/>`,
  shoes: `
    <path class="f" d="M64 24 Q88 24 90 58 L92 150 Q90 178 66 178 Q42 178 42 150 L44 58 Q46 24 64 24 Z"/>
    <path class="f" d="M136 24 Q112 24 110 58 L108 150 Q110 178 134 178 Q158 178 158 150 L156 58 Q154 24 136 24 Z"/>
    <path d="M56 60 L78 60 M56 74 L78 74 M56 88 L78 88 M122 60 L144 60 M122 74 L144 74 M122 88 L144 88"/>
    <path d="M50 120 Q66 128 84 120 M116 120 Q134 128 150 120"/>`,
  hat: `
    <path class="f" d="M61 106 Q100 200 139 106 Q100 132 61 106 Z"/>
    <path d="M70 120 Q100 170 130 120"/>
    <circle class="f" cx="100" cy="78" r="48"/>
    <path d="M100 78 Q96 54 100 30 M100 78 Q78 66 58 56 M100 78 Q122 66 142 56 M100 78 Q84 98 72 116 M100 78 Q116 98 128 116"/>
    <circle class="f" cx="100" cy="78" r="5"/>`,
  gloves: `
    <path class="f" d="M62 176 L60 104 Q58 84 70 84 L70 44 Q76 36 82 44 L82 80 L86 34 Q92 26 98 34 L96 80 L102 40 Q108 32 114 40 L110 84 L118 52 Q124 46 128 54 L118 112 Q132 96 142 104 L112 146 L108 176 Z"/>
    <path d="M62 160 L108 160"/>`,
  bag: `
    <path class="f" d="M58 46 Q58 26 78 26 L122 26 Q142 26 142 46 L146 170 Q146 182 134 182 L66 182 Q54 182 54 170 Z"/>
    <path class="f" d="M58 46 L142 46 L142 74 Q100 86 58 74 Z"/>
    <rect class="f" x="72" y="104" width="56" height="58" rx="10"/>
    <path d="M86 26 Q100 10 114 26 M78 126 L122 126"/>`,
  tent: `
    <path d="M52 58 L30 34 M148 58 L170 34 M44 142 L22 166 M156 142 L178 166"/>
    <circle class="f" cx="30" cy="34" r="4"/><circle class="f" cx="170" cy="34" r="4"/>
    <circle class="f" cx="22" cy="166" r="4"/><circle class="f" cx="178" cy="166" r="4"/>
    <path class="f" d="M52 58 L148 58 L156 142 L44 142 Z"/>
    <path class="f" d="M64 142 L100 180 L136 142 Z"/>
    <path d="M100 58 L100 142 M76 58 L70 142 M124 58 L130 142"/>`,
  'sleeping-pad': `
    <rect class="f" x="68" y="18" width="64" height="164" rx="16"/>
    <path d="M70 44 L130 44 M70 64 L130 64 M70 84 L130 84 M70 104 L130 104 M70 124 L130 124 M70 144 L130 144 M70 164 L130 164"/>
    <circle cx="122" cy="30" r="4"/>`,
  'sleeping-bag': `
    <path class="f" d="M100 18 Q144 18 144 62 L132 168 Q100 186 68 168 L56 62 Q56 18 100 18 Z"/>
    <ellipse class="f" cx="100" cy="54" rx="24" ry="20"/>
    <path d="M124 64 L114 172"/>
    <path d="M62 100 Q100 110 138 100 M64 130 Q100 140 136 130"/>`,
  quilt: `
    <path class="f" d="M56 22 L144 22 L136 148 Q100 184 64 148 Z"/>
    <path d="M60 52 L140 52 M62 82 L138 82 M64 112 L136 112 M66 140 L134 140"/>
    <path d="M56 22 L60 34 M144 22 L140 34"/>`,
  cooking: `
    <circle class="f" cx="88" cy="100" r="52"/>
    <circle cx="88" cy="100" r="42"/>
    <rect class="f" x="138" y="93" width="44" height="14" rx="7"/>
    <circle cx="88" cy="100" r="8"/>`,
  water: `
    <path class="f" d="M70 30 Q60 40 60 58 L60 172 Q60 182 70 182 L92 182 Q102 182 102 172 L102 58 Q102 40 92 30 Z"/>
    <rect class="f" x="70" y="16" width="22" height="16" rx="4"/>
    <path class="f" d="M118 44 Q110 52 110 66 L110 172 Q110 182 120 182 L138 182 Q148 182 148 172 L148 66 Q148 52 140 44 Z"/>
    <rect class="f" x="120" y="30" width="18" height="14" rx="4"/>
    <path d="M60 110 L102 110 M110 116 L148 116"/>`,
  electronics: `
    <rect class="f" x="54" y="30" width="66" height="112" rx="12"/>
    <path d="M70 122 L104 122 M78 52 L96 52"/>
    <path d="M87 142 L87 158 Q87 182 118 178 Q152 172 150 136 L150 96"/>
    <rect class="f" x="143" y="76" width="14" height="22" rx="3"/>`,
  'first-aid': `
    <rect class="f" x="36" y="56" width="128" height="96" rx="16"/>
    <path d="M36 74 L164 74"/>
    <path class="f" d="M92 86 L108 86 L108 102 L124 102 L124 118 L108 118 L108 134 L92 134 L92 118 L76 118 L76 102 L92 102 Z"/>`,
  accessories: `
    <ellipse cx="100" cy="112" rx="72" ry="44"/>
    <ellipse cx="100" cy="112" rx="64" ry="36"/>
    <rect class="f" x="76" y="56" width="48" height="34" rx="8"/>
    <circle class="f" cx="100" cy="73" r="10"/>`,
};
