import { Archetype } from "./types";

export const GRIMOIRE_SYSTEM_PROMPT = `
You are “Grimoire Artificer”, a Digital Concept Artist creating **RAW FULL-BLEED ILLUSTRATIONS**.

**OBJECTIVE**: Generate a high-resolution digital art file.
**NON-OBJECTIVE**: Do NOT generate a "card", a "product", or a "scan".

**STRICT BORDER CONTROL**:
1. **FULL BLEED**: The artwork must extend to every single pixel of the edge.
2. **NO PHYSICAL EDGES**: Do not render the edges of paper, cardboard, or a frame.
3. **NO WHITE BORDERS**: If the image has a white border, IT IS A FAILURE.
4. **NO LETTERBOXING**: The image must fill the aspect ratio completely.

**VISUAL INSTRUCTION**: 
Imagine you are painting a "textless marketing poster" or a "desktop wallpaper" for the character/scene. The camera should be slightly closer than usual to ensure the subject fills the frame without dead space or borders.

#### GENERAL VISUAL STYLE
- **Style**: Modern Anime / Comic Book Digital Art.
- **Line art**: Clean, crisp, professional.
- **Color**: Vibrant, distinct, high contrast.
- **Negative Constraints**: NO UI, NO text, NO logos, NO mana symbols, NO stats, NO artist signatures.

#### CARD TYPE COMPOSITION (Concept Art Rules)
Although these are for cards, treat them as SCENES (illustrations only, never physical cards):

1) **MONSTER**
- **Action**: The monster, character, or entity alive in its environment. 
- **Framing**: Action shot, heroic pose, or imposing stance. NOT a static mugshot in a box.
- **Anatomy**: 
  - **WYVERNS**: 2 Legs + 2 Wings (Wings are arms).
  - **DRAGONS**: 4 Legs + 2 Wings.

2) **SPELL**
- **Action**: Depict the magical phenomenon, arcane activation, enchanted relic, or spellcasting event.
- **Framing**: Dynamic angles, foreshortening, or focal intimacy.
- **Context Harmony**: Adapt to Context Focus and user description. If Context is Object (e.g., a grimoire, amulet, or wand), keep that object as the primary subject rather than forcing a generic explosion. If Scenario, emphasize the magical landscape or transformed environment.

3) **TRAP**
- **Action**: Depict the deceptive mechanism, triggered seal, imminent hazard, ambush, or sudden counter-magic.
- **Framing**: Close-ups, dramatic perspective, or high-contrast shadows.
- **Context Harmony**: Adapt to Context Focus and user description. If Context is Object, focus on the perilous device, contraption, or cursed artifact. If Scenario, focus on the dangerous room, snare, or terrain. A victim is not mandatory.

#### ARCHETYPE STYLING
- Apply the visual flavor (Palette, Motifs) of the selected Archetype strictly.
- Prioritize the Archetype's aesthetic over generic fantasy tropes.

#### BEHAVIOR SUMMARY
1. Ignore "Card Game" physical constraints.
2. Paint a **Digital Illustration**.
3. Fill the canvas 100%.
`;

export const ARCHETYPE_DEFINITIONS: Record<Archetype, string> = {
  [Archetype.Generic]: `[[SHADOW DUEL GENERIC CORE STYLE]]:
Core fantasy: archetype-neutral premium fantasy card illustration for Shadow Duel. The artwork must feel like a finished trading card illustration, not generic concept art, not a character sheet, and not a plain fantasy portrait.

Main rule: since no archetype is selected, infer one clear visual identity from the user's subject description. Choose one dominant theme and commit to it visually: arcane, martial, elemental, cursed, divine, beast, relic, ritual, battlefield, ancient ruin, monster horror, or heroic fantasy. Do not blend too many unrelated themes.

Visual style: modern anime/comic fantasy illustration, clean readable silhouette, polished digital painting, strong contrast, crisp forms, cinematic lighting, detailed but not cluttered. The image should look premium, dramatic, and immediately readable at card size.

Composition rule: avoid default centered full-body posing unless the subject specifically needs it. Use dynamic camera angles, diagonal movement, foreground/midground/background depth, dramatic cropping, strong focal hierarchy, and environmental storytelling. The subject should fill the frame, but the scene should not feel like a blank character showcase.

Monster design: monsters and characters must have a distinct role, silhouette, material identity, and visual hook. Avoid bland armored warriors, default dragons, generic demons, generic mages, or human poses with no personality. Add one or two memorable features based on the prompt, such as unusual anatomy, signature weapon, symbolic ornament, distinctive armor shape, ritual markings, elemental damage, relic fragments, or environment interaction.

Spell design: spells should depict the exact magical event happening, not just a person posing with energy. Show source, motion, impact, and consequence: runes activating, matter transforming, energy tearing through space, objects being restored, shields forming, chains binding, portals opening, fragments recombining, or a battlefield changing. Avoid generic floating magic circles with no story.

Trap design: traps should show timing, danger, and reaction. Focus on ambushes, mechanisms, sudden binding chains, collapsing floors, hidden sigils, counterattacks, cursed seals, reflected attacks, or a victim caught at the decisive moment. Use sharp shadows and strong tension.

Object / Equip design: if the subject is an object, do not render it like a product on an empty background. Show it being activated, held, discovered, forged, sealed, repaired, cursed, or surrounded by environmental clues. The object must be the focal point but should exist inside a dramatic scene.

Scenario / Field design: if the subject is a place, make the environment the main character. Use strong depth layers, atmospheric perspective, a clear landmark, readable architecture or natural forms, and one active magical/weather/environmental event.

Palette rule: follow the user prompt first. If the user prompt is vague, choose a controlled palette with 2–3 dominant colors and 1 accent color. Avoid muddy rainbow palettes, random neon, or colors that do not support the subject.

Lighting rule: use lighting to explain the concept. The main light should come from a meaningful source: spell burst, sunset, moonlight, forge, portal, ritual circle, divine ray, cursed crystal, fire, lightning, or environmental glow. Avoid flat studio lighting.

Background rule: the background must support the card concept without overpowering the focal subject. Avoid empty backgrounds, white voids, plain smoke clouds, or meaningless abstract gradients.

Negative: no bland generic fantasy, no plain full-body concept sheet, no static centered portrait by default, no empty background, no random magic circle with no narrative, no photorealism, no 3D render look, no plastic CGI, no muddy low-contrast painting, no overcluttered background, no unreadable silhouette, no card frame, no UI, no logo, no watermark, no readable text.`,
  [Archetype.Voidwalkers]: `[[VOID STYLE]]:
  Palette bias: Mostly black, charcoal gray, dark desaturated blue-gray, aged bone white, and deep muted purple. Cyan/teal glow must be used as small accents only, not as the main lighting.
  Core design: Extradimensional void creatures, undead horrors, hollow knights, beasts, insects, dragons or specters made of black smoke, skeletal anatomy, exposed ribs, cracked bone armor, broken stone-like carapace, claws, fangs, horns, and hollow glowing eyes.
  Lighting rule: Low-key lighting, heavy shadows, strong black silhouette. The creature should remain mostly dark; cyan glow appears only in eyes, chest core, thin cracks, runes, claws or weapon edges. Avoid bright cyan backlight flooding the whole image.
  Motifs: Abyssal fog, floating ruins, broken pillars, chains, drifting debris, gravity distortion, sealed prison-dimension atmosphere, sparse geometric runes carved into stone or body.
  Shape language: Lean, eerie, predatory, corrupted and unnatural. Partially physical and partially made of darkness, smoke or void mist. Avoid heroic paladin poses unless specifically requested.
  Mood: Oppressive void, silence, decay, cursed existence, cosmic prison, ancient abyssal horror.
  Style notes: Dark fantasy anime illustration, clean readable silhouette, detailed but not overbright. Emphasize darkness, emptiness and undead/cosmic horror over polished armor or noble fantasy knight aesthetics.
  Avoid: overly bright teal lighting, clean heroic armor, holy paladin look, colorful magical background, friendly fantasy boss, excessive glowing runes, excessive purple cape dominance.`,
  [Archetype.LuminarchKnights]: `[[LUMINARCH KNIGHTS STYLE]]:
  **Visual Style**: High fantasy digital illustration. Extremely cohesive and recognizable Luminarch visual identity.
  
  **Palette (Strict)**: 
  - **Armor**: Marbled white / satin matte silver (polished "holy" metal like ceramic/marble, NOT dark chrome).
  - **Trim**: Noble gold only on edges and filigree.
  - **Fabric**: Petrol blue / deep teal (capes/tabards).
  - **Magic**: Neon cyan / aqua green (gem glow, runes, energy).

  **Line Work & Rendering**:
  - Clean and elegant. Thin but well-defined outlines, precise clean lineart.
  - Smooth digital painting with clean gradients.
  - NO "gritty" texture, heavy noise, dirty brushes, or rusty appearance.

  **Armor Design (DNA)**:
  - Full plate armor, segmented and curvilinear. Rounded, organic shapes (non-aggressive). Large, spherical pauldrons.
  - All pieces feature **dense gold filigree**.
  - **Face of Justice**: Closed helm, impersonal and solemn. Vertical or "T" slit visor.

  **Symbology**: Celestial theme, Sun and Moon duality. Light halos/rings behind character. Floating runes/celestial symbols. Cyan magic effects.

  **Lighting**: Divine lighting from above/behind (god rays). Ethereal atmosphere.

  **Background**: Minimalist atmospheric (light clouds, ethereal sky, white temple, soft aurora).

  **Negative**: Chibi, cartoon, thick outlines, muddy colors, grimdark, gothic horror, blood/mud/battle damage.`,
  [Archetype.Arcanists]: `[[ARCANISTS STYLE]]:
  **Visual Style**: Academic style arcanist mage, imposing and elegant silhouette.
  **Composition**: Centered full body, extremely readable.
  **Pose**: Conjuring pose (one hand "writing" glyphs in the air, the other holding a tall staff or a grimoire/artifact).
  **Appearance**: Face partially hidden by a hood or ornamental mask, glowing eyes.
  **Attire**: Layered robes with heavy drape (long, well-structured cloak, high collar, sashes, and tabard). Precision embroidered geometric and runic patterns. Cold metallic details (silver/polished iron).
  **Palette**: **STRICTLY FOLLOW USER PROMPT**. Do not enforce a default color scheme.
  **VFX**: 1–2 legible geometric runic circles. Energy trails in arcs/circuits around the body.
  **Rendering**: Anime illustration, semi-realistic, clean lineart, soft shading with gradients, polished highlights.
  **Negative**: Avoid void/corruption aesthetics, heavy smoke, chaotic lightning, tentacles, blood, holy cathedral settings. No dirty texture, no 3D look, no photorealism.
  **Background**: Minimalist ethereal (light mist + discrete arcane geometry), total focus on character. No text, no watermark.`,
  [Archetype.ShadowHeart]: `[[SHADOW-HEART STYLE]]:
  **Core Fantasy**: A cursed gothic kingdom devoted to a demonic crystal Heart. Ruined cathedrals, black spires, chained sanctuaries, broken stained glass, demonic silhouettes, and corrupted heart-shaped crystals.

  **Mandatory Monster Trait**: Every Shadow-Heart monster, demon, dragon, beast, humanoid, or character must have a visible fractured crystal heart embedded naturally in the chest, ribcage, or central torso. The heart should feel like part of the body, armor, or anatomy, not like a sticker or floating ornament. It does not need to be the brightest element or the main focal point, but it must be clearly present and readable. Extra heart crystals on weapons, staffs, hands, wings, or in the background are allowed, but they must not replace the required chest/core heart.

  **Signature Sky**: Shadow-Heart art should strongly feature a Rose Red / crimson-magenta apocalyptic sky whenever the scene allows it. The sky or upper background should usually contain a large swirling vortex, blood-red cyclone, cursed spiral storm, demonic eclipse, or crimson whirlpool cloud formation. This red vortex is one of the archetype's main visual signatures. It should feel atmospheric and natural to the scene, not pasted on. If the scene is indoors or close-up, show the vortex through broken cathedral windows, above ruined arches, as a magical ceiling, or as a red spiral aura behind the subject.

  **Color & Light**: Palette is black, graphite, cold dark gray, deep maroon, Rose Red, neon crimson, magenta, and hot pink. The brightest accents usually come from fractured crystal hearts, heart-shaped gems, stained-glass hearts, floating shards, or cracks in armor. IMPORTANT: While the sky features Rose Red, do NOT let this red tint or wash out the entire image. The characters and foreground should maintain their own contrasting colors (like blacks, dark grays, and maroons) without being overwhelmingly bathed in red light. Avoid blue or green magic as the main effect color.

  **Motifs**: Gothic cathedrals, pointed arches, stained-glass hearts, floating crystal shards, chains, skulls, thorny organic armor, demonic wings, cursed heart cores, red storm vortexes, broken church silhouettes, apocalyptic ruins.

  **Monster Design**: Shadow-Heart monsters should look brutal, cursed, demonic, predatory, and tragic. Use black organic armor, spikes, thorns, fangs, horns, chains, red crystal hearts embedded in the body, glowing crimson cracks, and corrupted gothic anatomy. Dragons and beasts should still carry the mandatory crystal heart in the chest or central torso.

  **Spell and Trap Design**: Magic should appear as crimson heart energy, shattered pink crystal, cursed chains, red-black vortexes, blood-red storm clouds, corrupted cathedral light, or demonic heart pulses. Spell and Trap scenes may focus more on environment, ritual, or energy, but should still preserve the Rose Red sky/vortex identity when the sky is visible.

  **Mood**: Tragic, apocalyptic, cult-like, romantic horror, cursed devotion, demonic kingdom, end-of-the-world cathedral atmosphere.

  **Render Feel**: Iconic and graphic, like a dark comic book cover. Strong silhouette, high contrast, full-bleed vertical illustration, subject filling the frame.

  **Negative**: no Shadow-Heart monster without a visible crystal heart in the chest or central torso, no heart crystal only on a weapon, no heart crystal only in the hand, no heart crystal only in the background, no missing chest/core heart, no plain gray-only sky, no neutral storm clouds without Rose Red atmosphere, no blue/cyan sky, no blue/green magic dominance, no clean heroic paladin look, no sci-fi neon, no cheerful fantasy, no white background, no borders, no text.`,
  [Archetype.ExtremeDragons]: `[[EXTREME DRAGONS STYLE]]:
imposing boss dragon, elegant and powerful anatomy, four wings spread in an X shape, majestic airborne pose, clean iconic silhouette, regal horned head, long tail, extreme elemental theme, near-symmetrical composition, high fantasy anime card art, detailed but readable design`,
  [Archetype.ZodiacTalismans]: `stylized zodiac animal sigil, calligraphic brushstroke line art, minimalist zoomorphic emblem, animal formed from a few flowing curved brush strokes, flat solid color, sharp tapered line ends, ancient magical talisman symbol, clean cartoon icon, vector-like design, centered on an ancient stone talisman or parchment charm, simple readable silhouette, mystical but clean composition, no realistic anatomy, no detailed fur, no complex background`,
  [Archetype.Miragebound]: `[[MIRAGEBOUND STYLE]]:
  Core fantasy: desert illusionists, mirage-bound beasts, glass spirits, masked wanderers, false horizons, oasis reflections, heat haze, and magical misdirection. The subject should feel elusive, elegant, and difficult to grasp, as if it is half-real and half-reflection.

  Palette: warm desert gold, pale sand, ivory, sun-bleached beige, bronze, soft amber, muted teal, turquoise, and glassy cyan accents. Use violet or rose tones only as subtle magical shadows. Avoid dark void palettes, gothic crimson, holy white-gold paladin lighting, and overly saturated rainbow colors.

  Visual motifs: shimmering heat distortion, floating mirror shards, refracted duplicate silhouettes, curved glass blades, veils, scarves, layered desert robes, ornamental masks, crescent shapes, oasis water reflections, sand trails, mirage portals, translucent glass armor, jackals, vipers, dancers, scouts, and desert spirits.

  Character design: slender and agile silhouettes, flowing cloth, elegant masks, light armor, asymmetrical ornaments, curved weapons, dance-like poses, evasive movement, mystical desert nomad aesthetic. They should look graceful and deceptive, not bulky, brutal, undead, demonic, or knightly.

  Monster design: beasts and spirits should look like desert mirages made physical: glass scales, translucent edges, sand particles dissolving from the body, reflective eyes, elegant predatory forms, and partial duplicate afterimages. Keep the silhouette readable and iconic.

  Spell design: magic appears as refraction, false copies, heat haze waves, sand-glass distortions, mirror flashes, vanishing steps, and warped horizons. Avoid generic fireballs, lightning storms, holy beams, or dark void explosions unless specifically requested.

  Trap design: deceptive desert scenes, false paths, mirror snares, vanishing footprints, collapsing reflections, ambushes hidden in heat haze, or a victim striking an illusion instead of the real target.

  Lighting: harsh desert sunlight mixed with cool reflective rim light. Strong silhouettes against glowing sand, oasis reflections, or sunset skies. The image may use haze, but the main subject must remain sharp and readable.

  Mood: mysterious, elegant, evasive, tactical, dreamlike, sun-scorched, deceptive. More “beautiful illusion in the desert” than horror or holy fantasy.

  Composition: dynamic anime/comic card art, full-bleed illustration, subject filling the frame, cinematic angle, readable action, no card frame, no text, no UI.

  Avoid: heavy marker/counter visuals, mechanical clockwork, gothic cathedrals, undead void horror, holy paladin armor, excessive black smoke, blood, gore, cyberpunk neon city, bulky armor, static portrait pose, white background, borders, text, logos.`,
  [Archetype.Bloomrot]: `[[BLOOMROT STYLE]]:
Core fantasy: Dark fantasy biological, fungal and parasitic archetype. It represents a rotting ancient forest overtaken by invasive fungi, aggressive mycelium, corrupted plant life, parasitic organisms, spore infection and living organic decay. The subject should feel like part of a diseased ecosystem: ancient, hostile, damp, alive and constantly spreading.

Visual direction: Create a detailed fantasy card illustration with a strong focal subject, readable silhouette, refined rendering and dense dark fantasy atmosphere. The aesthetic should feel organic, strange, parasitic, rotten and memorable. Bloomrot should look like corrupted nature evolving into many different lifeforms, not like a single race of mushroom people.

Creature design: Bloomrot creatures should NOT be humanoid by default. Avoid repeatedly generating skinny human-shaped bodies with mushroom heads. Prioritize diverse non-humanoid body plans such as fungal beasts, infected animals, parasitic insects, mycelium spiders, rotting stags, fungal amphibians, crawling root masses, carnivorous flowers, living spore sacs, mollusk-like organisms, bulbous growths, hollow trunk monsters, reanimated carcasses, root serpents, fungal shells, infected nests and colony organisms made of fungus, roots, bark, bone and corrupted plant matter.

Humanoid exception: Humanoid or semi-humanoid forms are allowed only when specifically requested by the card concept. Even then, they should look partially overtaken by roots, bark, fungus, mycelium and parasitic growth, not like a person wearing mushroom armor. Humanoid forms should be rare within the archetype.

Visual variety: Each Bloomrot monster should have a distinct body plan and color identity. Do not make the cards differ only by pose. Vary anatomy, proportions, number of limbs, presence or absence of eyes, texture, size, creature type, fungal growth pattern, root structure, petals, spore sacs, mandibles, shells, tendrils, bones and parasitic blooms.

Environment: The setting should usually suggest a humid, ancient and contaminated forest. Use hollow trees, twisted trunks, exposed roots, organic mud, low mist, spreading mycelium, drifting spores, dark pools, decayed vegetation, carcasses reclaimed by nature, bioluminescent fungi, dead clearings, fungal swamps, rotten groves or natural chambers infested by parasitic growth.

Palette: The overall atmosphere should remain dark fantasy, organic and decayed, but the creatures should NOT be limited to only brown, green and gray. The environment may use shadowed moss green, wet soil, rotten bark, organic black, foggy gray and dead forest tones, but individual creatures may use varied fungal and parasitic colors.

Allowed creature color identities include fungal ivory, sickly beige, bone white, ochre yellow, amber, spore yellow, rust orange, carrion red, wine red, dark crimson, bruised purple, dirty lilac, deep violet, muted magenta, decayed pink, pale cyan, ghost blue, blue-green, diseased teal, moldy lime, toxic yellow-green, corpse-pale tones and controlled fungal orange. Colors should feel organic, damp, infected, poisonous, parasitic or bioluminescent, not cheerful, clean or neon.

Color rule: Bloomrot should have unity of atmosphere, not monotony of palette. Keep the shared mood rotten, fungal, parasitic and dark fantasy, but allow each creature to have its own distinct palette.

Bioluminescence: Subtle glow is allowed and encouraged as an accent. Glow colors may vary by card: pale cyan, ghost blue, sickly yellow, toxic green, amber, dim violet or muted magenta. Use glow on spores, eyes, active mycelium, infected veins, fungal sacs, inner organic fissures or parasitic growths. Do not turn the whole subject into a bright magical aura.

Textures and materials: Mix organic materials such as dead bark, hollow wood, fibrous roots, fleshy fungus, damp moss, mold, wet plant matter, corrupted petals, spore colonies, organic plates, membranes, bone fragments absorbed by growth, fungal shells and decayed vegetation. Surfaces should feel tactile, moist, layered and biological.

Mood: The art should evoke infestation, proliferation, parasitism, mutation, organic decay, diseased beauty, biological strangeness, silent threat and the dominance of a corrupted forest ecosystem.

Composition: The main subject must be clear and readable, with a strong silhouette suitable for vertical trading card art. The background should support the creature without hiding it. Avoid excessive clutter that makes the body shape hard to read.

Rendering: Modern anime/comic dark fantasy digital illustration, crisp forms, detailed organic textures, moody lighting, cinematic composition, atmospheric forest decay, fungal horror, parasitic lifeforms, premium trading card illustration.

Negative: avoid repeated mushroom-headed humanoids, default human anatomy, human faces by default, normal arms and legs unless specifically requested, cute mushroom mascots, cheerful forest vibes, clean polished armor, sci-fi biotech, overly clean neon glow, generic poison slime, overly symmetrical designs, empty backgrounds, and making every creature share the same green-brown-gray palette.`,
  [Archetype.BurningWest]: `[[BURNING WEST STYLE]]:
Core fantasy: A cursed old western frontier where gunslingers, sheriffs, undertakers, preachers, outlaws, grave-keepers and executioners exist in a smoldering ember state. They look like people and creatures sustained by a fading inner fire, with clothing, skin, armor, leather, and gear lightly consumed by glowing embers, ash cracks, soot, and thin smoke, similar to a cursed embered state rather than full combustion.

Important fire rule: Burning West characters are NOT generic fire elementals and should not be engulfed in massive flames. The fire is controlled, low, cursed, and internal. Show ember glow, ash cracks, smoke trails, charred clothing edges, heated metal, ember veins, glowing eyes, and small sparks. Keep the design readable and preserve the western identity of the subject.

Palette: dusty western browns, scorched leather, charcoal black, ash gray, smoke gray, desert beige, weathered wood, dark iron, muted ember orange, dull crimson, burnt red, and smoky maroon. Bright flame orange or yellow should appear only as accents. Do not let the whole image become a bright orange inferno.

Setting: cursed frontier towns, wooden saloons, sheriff offices, gallows, graveyards, desert roads, train tracks, mines, canyons, burned chapels, abandoned streets, wanted posters, lantern light, ember-lit windows, dusty sunsets, drifting ash, and haunted ghost-town scenery. The world should feel like an old west frontier slowly burning from within.

Monster design: Burning West monsters should usually be humanoid or semi-humanoid western figures, but they must not all look the same. Each one should have a distinct silhouette, role, body language, gear set, and visual emphasis. Use different western archetypes such as gunslingers, preachers, sheriffs, undertakers, drifters, duelists, executioners, hunters, masked riders, ash-covered wanderers, grave-keepers, and cursed frontier enforcers. Vary body types, hats, coats, ponchos, masks, holsters, badges, belts, spurs, weapons, props, and accessories.

Variety rule: Do not make all monsters look alike. Avoid repeated character templates, repeated framing, repeated silhouettes, repeated neutral standing poses, or generic “same cowboy” designs. Every monster should feel like a different individual with a different role in the archetype.

Pose rule: Do not default to characters simply posing for the camera. Favor action, tension, movement, storytelling, or strong environmental interaction when appropriate. Characters may be drawing a revolver, aiming, reloading, turning sharply, kneeling, dragging a coffin, kicking saloon doors open, stepping through smoke, bracing for a duel, emerging from grave dust, holding ground in a standoff, or acting mid-conflict. Only use a straight character pose when the concept specifically calls for it.

Camera rule: Use varied camera angles depending on the card’s role and scene. Mix low angles, high angles, side angles, over-the-shoulder shots, dynamic perspective, dramatic close-ups, action framing, partial-body focus, environmental shots, and cinematic wide compositions. Do not make every image a centered front-facing full-body portrait.

Focus rule: Highlight what matters most for that specific card. If the card is about a weapon or equipment, emphasize the weapon. If it is about a duel, emphasize the clash and tension. If it is about an ambush or trap, emphasize the event, scene, or sudden action. If it is about a place, emphasize the location and atmosphere. If it is about a character, emphasize the defining role and signature prop or gesture. Composition should serve the card’s concept, not a default character showcase.

Spell design: Spells should depict dramatic cursed western actions and motifs: quickdraw duels, smoking revolvers, ember bullets, cursed wanted posters, burning contracts, blazing lanterns, shovel rituals, grave dust, ash trails, saloon doors flying open, train smoke, cursed weapons, desert wind, or high-noon tension. Avoid readable text on signs, posters, or papers.

Trap design: Traps should feel reactive, dangerous, and sudden. Show ambushes, hidden shooters, smoke-covered attacks, graveyard tricks, collapsing gallows, mine cave-ins, explosive barrels, saloon shootouts, surprise counters, duel interrupts, and silhouettes emerging through ash and dust. Favor tension, impact, and timing over static composition.

Lighting: Use high contrast western dusk lighting mixed with ember glow and smoke. Favor dramatic shadows, dusty light shafts, glowing metal, rim light from lanterns or embers, dark silhouettes, and cinematic contrast. The fire should enhance mood, not wash out the whole image.

Style rule: Keep the artwork stylized, expressive, and clearly closer to anime/comic trading card illustration than realism. Avoid photorealism, live-action realism, or overly grounded cinematic realism. Use bold silhouettes, exaggerated motion, visual drama, and clear focal storytelling.

Mood: cursed western, ember oath, haunted frontier, dusty revenge, violent duel, ghost-town tension, grim but stylish, cinematic, dangerous, and supernatural.

Composition: modern anime/comic trading card illustration, dynamic full-bleed vertical composition, strong silhouette, subject filling the frame when appropriate, rich background storytelling, no card frame, no UI, no logo, no readable text.

Negative: no generic full-body fire elemental, no monster fully engulfed in giant flames, no cheerful cowboy aesthetic, no comedic western tone, no clean heroic western, no same character template repeated, no identical monster designs, no front-facing centered portrait for every card, no static posing by default, no photorealism, no live-action realism, no modern tactical gear, no sci-fi guns, no cyberpunk neon, no white background, no card borders, no readable text, no image fully washed in orange flames, no excessive realism, no repeated angle across cards.`,
  [Archetype.TechZero]: `[[TECH-ZERO STYLE]]:
Core fantasy: advanced modular machine monsters, transforming units, reactor beasts, robotic constructs, and engineered battle machines created in a futuristic assembly and testing facility.

Visual identity: Tech-Zero monsters must look robotic, hard-surface, angular, and engineered. Favor polygonal armor, segmented plating, exposed joints, vents, turbines, cables, weapon modules, reactor cores, visors, mechanical claws, and modular machine parts. Avoid organic flesh and avoid making every monster a humanoid mecha.

Silhouette rule: vary the body plan across the archetype. Some monsters should be bipedal, some draconic, some avian, some quadrupedal, some serpentine, some compact utility machines, and some hybrid mechanical forms. Do not default to humanoid mecha for every subject.

Palette rule: Each card should use one clearly defined secondary accent color that varies from card to card. Do not default to cyan for every card. Possible accent colors include orange, red, yellow, lime, green, violet, magenta, cobalt blue, or cyan.

Background rule: the monster must always be the clear focal point. The background should support the subject, not compete with it. Use a futuristic machine assembly or testing facility as context, but keep it simplified, spacious, and visually restrained.

Background restraint: reduce background clutter. Avoid dense holograms, crowded conveyor belts, excessive robotic arms, and overly busy industrial detail. If machinery appears in the background, place it farther away, smaller, and less prominent. Leave more open space around the monster so the design reads clearly.

Scientist rule: a few scientists or engineers may appear in the background, but only in small numbers and at a distance. They should look secondary, working on machines or observing tests, never competing with the monster for attention.

Composition: center the monster clearly and give it room to breathe. Use a clean composition with strong subject readability. The monster should dominate the frame, while the environment remains atmospheric and supportive.

Motion and pose: monsters should feel active, combat-ready, or functionally alive. Favor dynamic but readable poses. Avoid poses that make the silhouette unclear.

Spell design: show machine activation, assembly, calibration, deployment, synchronization, repair, dimensional docking, reconfiguration, or reactor startup in a simplified futuristic facility setting.

Trap design: show reactive machine systems, emergency redeployment, salvage recovery, defensive protocols, or synchronized countermeasures, with clear visual storytelling and restrained background detail.

Lighting: clean industrial lighting with strong highlights on metal surfaces. Let the lighting and background accents harmonize with the monster’s chosen secondary accent color. Avoid making every scene glow cyan.

Negative: avoid overly busy backgrounds, avoid too many holograms, avoid too many robotic arms in the foreground, avoid crowded conveyor scenes, avoid the background overpowering the subject, avoid making every card white-and-cyan, avoid generic humanoid mecha repetition, avoid organic flesh, avoid text, borders, logos, or watermarks.`,
  [Archetype.RoyalCarmine]: `[[ROYAL CARMINE STYLE]]:
Core fantasy: pure aristocratic fantasy. A royal family of elegant nobles, rulers, knights and servants who appear refined, noble and immaculate, but secretly gain power through blood pacts and personal sacrifice.

Visual identity: luxurious royal nobility with a bright and pristine appearance. Characters wear elegant white, ivory and silk garments, ceremonial clothing, refined armor, crowns, jewelry and noble accessories. The design should communicate status, purity and perfection, with subtle crimson details revealing the hidden cost of their power.

Palette: snow white, ivory, almond silk, pearl, silver, gold and deep crimson accents. White should dominate the design. Crimson appears only as a meaningful accent: gemstones, embroidery, royal symbols, ribbons, weapons, magical energy or hidden details. Avoid dark dominant palettes.

Character design: elegant aristocrats, nobles, knights, attendants and rulers. Focus on graceful silhouettes, expensive fabrics, ceremonial outfits, refined weapons and royal symbolism. Characters should feel powerful through elegance and authority, not through brutality or intimidation.

Motifs: royal halls, white marble palaces, luxurious fabrics, golden ornaments, family crests, ceremonial rooms, crowns, roses, elegant swords, crystal decorations and blood pact symbols hidden within noble imagery.

Magic design: magical effects should appear refined and ceremonial: crimson energy lines, blood contracts, elegant runes, glowing jewels, royal seals and ritual symbols. Avoid chaotic dark magic or monstrous corruption.

Environment: bright royal palaces, marble halls, gardens, grand ceremonies and noble estates. The environment should feel majestic, clean and luxurious.

Lighting: bright divine-like lighting, soft golden highlights, white interiors and subtle crimson contrast. The atmosphere should feel noble and pristine.

Mood: majestic, elegant, pure, ambitious and mysterious. The beauty of the court hides dangerous power.

Composition: modern anime/comic fantasy illustration, premium trading card artwork, full-bleed vertical composition, strong silhouette, elegant dynamic poses.

Negative: avoid gothic horror, vampires, undead, demons, dark castles, excessive blood, gore, grimdark fantasy, corrupted monsters, black dominant clothing, cyberpunk, neon colors, dirty medieval clothing, generic warriors, text, logos, borders or watermarks.`,
};