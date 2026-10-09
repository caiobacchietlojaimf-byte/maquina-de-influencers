// Public Higgsfield studio catalog, synchronized by scripts/sync-influencer-traits.mjs.
import type { CharacterTier } from "./character-types";

export const TRAIT_MEDIA: Readonly<Record<string, { image?: string; swatch?: string; imageFit?: "contain" | "cover" }>> = {
  "female": {
    "image": "/influencer-traits/female.webp"
  },
  "male": {
    "image": "/influencer-traits/male.webp"
  },
  "trans_man": {
    "image": "/influencer-traits/trans_man.webp"
  },
  "trans_woman": {
    "image": "/influencer-traits/trans_woman.webp"
  },
  "non_binary": {
    "image": "/influencer-traits/non_binary.webp"
  },
  "african": {
    "image": "/influencer-traits/african.webp"
  },
  "east_asian": {
    "image": "/influencer-traits/east_asian.webp"
  },
  "european": {
    "image": "/influencer-traits/european.webp"
  },
  "indian": {
    "image": "/influencer-traits/indian.webp"
  },
  "middle_eastern": {
    "image": "/influencer-traits/middle_eastern.webp"
  },
  "latin_american": {
    "image": "/influencer-traits/latin_american.webp"
  },
  "adult": {},
  "mature": {},
  "senior": {},
  "st_porcelain": {
    "swatch": "#f1e2d5"
  },
  "st_fair": {
    "swatch": "#e8c9b5"
  },
  "st_light": {
    "swatch": "#dab49a"
  },
  "st_olive": {
    "swatch": "#b6976e"
  },
  "st_tan": {
    "swatch": "#bc8e67"
  },
  "st_brown": {
    "swatch": "#805135"
  },
  "st_deep": {
    "swatch": "#543621"
  },
  "st_ebony": {
    "swatch": "#2d211b"
  },
  "h_short": {},
  "h_average": {
    "image": "/influencer-traits/h_average.webp"
  },
  "h_tall": {
    "image": "/influencer-traits/h_tall.webp"
  },
  "h_very_tall": {
    "image": "/influencer-traits/h_very_tall.webp"
  },
  "body_slim": {
    "image": "/influencer-traits/body_slim.webp"
  },
  "body_athletic": {
    "image": "/influencer-traits/body_athletic.webp"
  },
  "body_muscular": {
    "image": "/influencer-traits/body_muscular.webp"
  },
  "body_curvy": {
    "image": "/influencer-traits/body_curvy.webp"
  },
  "body_heavy": {
    "image": "/influencer-traits/body_heavy.webp"
  },
  "body_ultra": {
    "image": "/influencer-traits/body_ultra.webp"
  },
  "pr_centaur": {
    "image": "/influencer-traits/pr_centaur.webp",
    "imageFit": "contain"
  },
  "body_glutes": {},
  "pr_longlimbs": {
    "image": "/influencer-traits/pr_longlimbs.webp"
  },
  "pr_shortlegs": {
    "image": "/influencer-traits/pr_shortlegs.webp"
  },
  "pr_shoulders": {
    "image": "/influencer-traits/pr_shoulders.webp"
  },
  "pr_waist": {
    "image": "/influencer-traits/pr_waist.webp"
  },
  "pr_egg": {
    "image": "/influencer-traits/pr_egg.webp"
  },
  "pr_potbelly": {
    "image": "/influencer-traits/pr_potbelly.webp"
  },
  "head_oval": {
    "image": "/influencer-traits/head_oval.webp"
  },
  "head_long": {
    "image": "/influencer-traits/head_long.webp"
  },
  "head_tiny": {
    "image": "/influencer-traits/head_tiny.webp"
  },
  "head_forehead": {
    "image": "/influencer-traits/head_forehead.webp"
  },
  "head_ancient": {
    "image": "/influencer-traits/head_ancient.webp"
  },
  "head_herojaw": {
    "image": "/influencer-traits/head_herojaw.webp"
  },
  "head_megachin": {
    "image": "/influencer-traits/head_megachin.webp"
  },
  "head_round": {
    "image": "/influencer-traits/head_round.webp"
  },
  "head_square": {
    "image": "/influencer-traits/head_square.webp"
  },
  "head_heart": {
    "image": "/influencer-traits/head_heart.webp"
  },
  "head_blockjaw": {},
  "neck_normal": {
    "image": "/influencer-traits/neck_normal.webp"
  },
  "neck_column": {
    "image": "/influencer-traits/neck_column.webp"
  },
  "neck_long": {
    "image": "/influencer-traits/neck_long.webp"
  },
  "neck_short": {
    "image": "/influencer-traits/neck_short.webp"
  },
  "es_almond": {
    "image": "/influencer-traits/es_almond.webp"
  },
  "es_round": {
    "image": "/influencer-traits/es_round.webp"
  },
  "es_monolid": {
    "image": "/influencer-traits/es_monolid.webp"
  },
  "es_close": {
    "image": "/influencer-traits/es_close.webp"
  },
  "es_wide": {
    "image": "/influencer-traits/es_wide.webp"
  },
  "es_uneven": {
    "image": "/influencer-traits/es_uneven.webp"
  },
  "es_large": {
    "image": "/influencer-traits/es_large.webp"
  },
  "es_huge": {
    "image": "/influencer-traits/es_huge.webp"
  },
  "es_hooded": {
    "image": "/influencer-traits/es_hooded.webp"
  },
  "es_upturned": {
    "image": "/influencer-traits/es_upturned.webp"
  },
  "es_downturned": {
    "image": "/influencer-traits/es_downturned.webp"
  },
  "eye_black": {
    "swatch": "#191615"
  },
  "eye_brown": {
    "swatch": "#67432c"
  },
  "eye_hazel": {
    "swatch": "#887546"
  },
  "eye_green": {
    "swatch": "#648254"
  },
  "eye_blue": {
    "swatch": "#5182a1"
  },
  "eye_ice_blue": {
    "swatch": "#a5cbd6"
  },
  "eye_amber": {
    "swatch": "#bd8c45"
  },
  "eye_grey": {
    "swatch": "#939b9d"
  },
  "fn_freckles": {
    "image": "/influencer-traits/fn_freckles.webp"
  },
  "fn_dimples": {
    "image": "/influencer-traits/fn_dimples.webp"
  },
  "fn_eyebags": {
    "image": "/influencer-traits/fn_eyebags.webp"
  },
  "ff_marks_12": {
    "image": "/influencer-traits/ff_marks_12.webp"
  },
  "fn_cheekbones": {
    "image": "/influencer-traits/fn_cheekbones.webp"
  },
  "fn_fulllips": {
    "image": "/influencer-traits/fn_fulllips.webp"
  },
  "fn_thickbrows": {
    "image": "/influencer-traits/fn_thickbrows.webp"
  },
  "fn_mole": {
    "image": "/influencer-traits/fn_mole.webp"
  },
  "ff_nose_0": {
    "image": "/influencer-traits/ff_nose_0.webp"
  },
  "ff_nose_1": {
    "image": "/influencer-traits/ff_nose_1.webp"
  },
  "ff_nose_2": {
    "image": "/influencer-traits/ff_nose_2.webp"
  },
  "fn_tinynose": {
    "image": "/influencer-traits/fn_tinynose.webp"
  },
  "ff_lips_3": {
    "image": "/influencer-traits/ff_lips_3.webp"
  },
  "ff_lips_4": {
    "image": "/influencer-traits/ff_lips_4.webp"
  },
  "fn_widemouth": {
    "image": "/influencer-traits/fn_widemouth.webp"
  },
  "ff_brows_5": {
    "image": "/influencer-traits/ff_brows_5.webp"
  },
  "ff_brows_6": {
    "image": "/influencer-traits/ff_brows_6.webp"
  },
  "ff_brows_7": {
    "image": "/influencer-traits/ff_brows_7.webp"
  },
  "ff_ears_8": {
    "image": "/influencer-traits/ff_ears_8.webp"
  },
  "ff_ears_9": {
    "image": "/influencer-traits/ff_ears_9.webp"
  },
  "ff_teeth_10": {
    "image": "/influencer-traits/ff_teeth_10.webp"
  },
  "ff_teeth_11": {
    "image": "/influencer-traits/ff_teeth_11.webp"
  },
  "fn_pointychin": {
    "image": "/influencer-traits/fn_pointychin.webp"
  },
  "ff_chin_13": {
    "image": "/influencer-traits/ff_chin_13.webp"
  },
  "ff_forehead_14": {
    "image": "/influencer-traits/ff_forehead_14.webp"
  },
  "fn_arrowbrows": {},
  "fn_flatcheeks": {},
  "ff_chin_15": {},
  "fh_none": {
    "image": "/influencer-traits/fh_none.webp"
  },
  "fh_stubble": {
    "image": "/influencer-traits/fh_stubble.webp"
  },
  "fh_beard": {
    "image": "/influencer-traits/fh_beard.webp"
  },
  "fh_goatee": {
    "image": "/influencer-traits/fh_goatee.webp"
  },
  "fh_moustache": {
    "image": "/influencer-traits/fh_moustache.webp"
  },
  "fh_pencil": {
    "image": "/influencer-traits/fh_pencil.webp"
  },
  "fh_pushbroom": {
    "image": "/influencer-traits/fh_pushbroom.webp"
  },
  "fh_braid": {
    "image": "/influencer-traits/fh_braid.webp"
  },
  "fh_handlebar": {},
  "hs_lampshade": {
    "image": "/influencer-traits/hs_lampshade.webp"
  },
  "hair_bald": {
    "image": "/influencer-traits/hair_bald.webp"
  },
  "hair_buzz": {
    "image": "/influencer-traits/hair_buzz.webp"
  },
  "hair_bowl": {
    "image": "/influencer-traits/hair_bowl.webp"
  },
  "hair_mullet": {
    "image": "/influencer-traits/hair_mullet.webp"
  },
  "hair_braids": {
    "image": "/influencer-traits/hair_braids.webp"
  },
  "hair_pigtails": {
    "image": "/influencer-traits/hair_pigtails.webp"
  },
  "hair_afro": {
    "image": "/influencer-traits/hair_afro.webp"
  },
  "hair_punk": {
    "image": "/influencer-traits/hair_punk.webp"
  },
  "hs_pompadour": {
    "image": "/influencer-traits/hs_pompadour.webp"
  },
  "hs_beehive": {
    "image": "/influencer-traits/hs_beehive.webp"
  },
  "hs_dome": {
    "image": "/influencer-traits/hs_dome.webp"
  },
  "hair_long": {
    "image": "/influencer-traits/hair_long.webp"
  },
  "hair_short": {
    "image": "/influencer-traits/hair_short.webp"
  },
  "hs_horns": {
    "image": "/influencer-traits/hs_horns.webp"
  },
  "hs_softserve": {
    "image": "/influencer-traits/hs_softserve.webp"
  },
  "hs_sphere": {
    "image": "/influencer-traits/hs_sphere.webp"
  },
  "hs_mouse": {
    "image": "/influencer-traits/hs_mouse.webp"
  },
  "hs_wings": {
    "image": "/influencer-traits/hs_wings.webp"
  },
  "hs_hedgehog": {
    "image": "/influencer-traits/hs_hedgehog.webp"
  },
  "hs_tufts": {
    "image": "/influencer-traits/hs_tufts.webp"
  },
  "hs_stairs": {
    "image": "/influencer-traits/hs_stairs.webp"
  },
  "hs_shelf": {
    "image": "/influencer-traits/hs_shelf.webp"
  },
  "hs_corkscrews": {
    "image": "/influencer-traits/hs_corkscrews.webp"
  },
  "hs_sidecoil": {
    "image": "/influencer-traits/hs_sidecoil.webp"
  },
  "hs_mushroom": {
    "image": "/influencer-traits/hs_mushroom.webp"
  },
  "hs_curlblock": {},
  "hs_batwing": {},
  "hs_spirals": {},
  "hs_periwig": {},
  "hc_black": {
    "swatch": "#151515"
  },
  "hc_darkbrown": {
    "swatch": "#39281f"
  },
  "hc_chestnut": {
    "swatch": "#794a33"
  },
  "hc_ginger": {
    "swatch": "#b56131"
  },
  "hc_red": {
    "swatch": "#b43636"
  },
  "hc_blonde": {
    "swatch": "#d9b774"
  },
  "hc_platinum": {
    "swatch": "#e4d9bc"
  },
  "hc_grey": {
    "swatch": "#8c8c8c"
  },
  "hc_white": {
    "swatch": "#eee9dd"
  },
  "hc_pink": {
    "swatch": "#dd9ab7"
  },
  "hc_lilac": {
    "swatch": "#b0a0ce"
  },
  "hc_blue": {
    "swatch": "#4080bb"
  },
  "hc_green": {
    "swatch": "#548060"
  },
  "df_hetero": {
    "image": "/influencer-traits/df_hetero.webp"
  },
  "df_facetattoo": {
    "image": "/influencer-traits/df_facetattoo.webp"
  },
  "df_septum": {
    "image": "/influencer-traits/df_septum.webp"
  },
  "df_ears": {
    "image": "/influencer-traits/df_ears.webp"
  },
  "df_slits": {
    "image": "/influencer-traits/df_slits.webp"
  },
  "df_bleached": {
    "image": "/influencer-traits/df_bleached.webp"
  },
  "df_nobrows": {
    "image": "/influencer-traits/df_nobrows.webp"
  },
  "df_grill": {
    "image": "/influencer-traits/df_grill.webp"
  },
  "df_braces": {
    "image": "/influencer-traits/df_braces.webp"
  },
  "df_scar": {
    "image": "/influencer-traits/df_scar.webp"
  },
  "df_gems": {
    "image": "/influencer-traits/df_gems.webp"
  },
  "df_elf": {
    "image": "/influencer-traits/df_elf.webp"
  },
  "df_lashes": {
    "image": "/influencer-traits/df_lashes.webp"
  },
  "df_bandage": {
    "image": "/influencer-traits/df_bandage.webp"
  },
  "retro": {
    "image": "/influencer-traits/retro.webp"
  },
  "sporty": {
    "image": "/influencer-traits/sporty.webp"
  },
  "y2k": {
    "image": "/influencer-traits/y2k.webp"
  },
  "theatrical": {
    "image": "/influencer-traits/theatrical.webp"
  },
  "goth": {
    "image": "/influencer-traits/goth.webp"
  },
  "suits": {
    "image": "/influencer-traits/suits.webp"
  },
  "streetstyle": {
    "image": "/influencer-traits/streetstyle.webp"
  },
  "casual": {
    "image": "/influencer-traits/casual.webp"
  },
  "acc_none": {
    "image": "/influencer-traits/acc_none.webp"
  },
  "acc_glasses": {
    "image": "/influencer-traits/acc_glasses.webp"
  },
  "acc_headphones": {
    "image": "/influencer-traits/acc_headphones.webp"
  },
  "acc_jewelry": {
    "image": "/influencer-traits/acc_jewelry.webp"
  },
  "acc_hat": {
    "image": "/influencer-traits/acc_hat.webp"
  },
  "acc_bag": {
    "image": "/influencer-traits/acc_bag.webp"
  }
};

export const TRAIT_KINDS: Readonly<Record<string, "media" | "color" | "text">> = {
  "gender": "media",
  "ethnicity_origin_base": "media",
  "age": "text",
  "skin_tone": "color",
  "height": "media",
  "body_type": "media",
  "proportions": "media",
  "freak_head": "media",
  "freak_neck": "media",
  "eye_shape": "media",
  "eye_color": "color",
  "freak_face": "media",
  "facial_hair": "media",
  "hair": "media",
  "hair_colour": "color",
  "distinctive": "media",
  "aesthetic": "media",
  "accessory": "media"
};

export const TRAIT_RULES: Readonly<Record<string, { tiers: readonly CharacterTier[]; slot?: string; exclusive?: boolean }>> = {
  "female": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "male": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "trans_man": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "trans_woman": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "non_binary": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "african": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "east_asian": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "european": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "indian": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "middle_eastern": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "latin_american": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "adult": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "mature": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "senior": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "st_porcelain": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "st_fair": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "st_light": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "st_olive": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "st_tan": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "st_brown": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "st_deep": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "st_ebony": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "h_short": {
    "tiers": [
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "h_average": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "h_tall": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "h_very_tall": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "body_slim": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "body_athletic": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "body_muscular": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "body_curvy": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "body_heavy": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "body_ultra": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "pr_centaur": {
    "tiers": [
      "total"
    ]
  },
  "body_glutes": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "pr_longlimbs": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "pr_shortlegs": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "pr_shoulders": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "pr_waist": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "pr_egg": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "pr_potbelly": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "head_oval": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "head_long": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "head_tiny": {
    "tiers": [
      "freak",
      "total"
    ]
  },
  "head_forehead": {
    "tiers": [
      "freak",
      "total"
    ]
  },
  "head_ancient": {
    "tiers": [
      "total"
    ]
  },
  "head_herojaw": {
    "tiers": [
      "total"
    ]
  },
  "head_megachin": {
    "tiers": [
      "total"
    ]
  },
  "head_round": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "head_square": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "head_heart": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "head_blockjaw": {
    "tiers": [
      "total"
    ]
  },
  "neck_normal": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "neck_column": {
    "tiers": [
      "freak",
      "total"
    ]
  },
  "neck_long": {
    "tiers": [
      "freak",
      "total"
    ]
  },
  "neck_short": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "es_almond": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "es_round": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "es_monolid": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "es_close": {
    "tiers": [
      "freak",
      "total"
    ]
  },
  "es_wide": {
    "tiers": [
      "freak",
      "total"
    ]
  },
  "es_uneven": {
    "tiers": [
      "freak",
      "total"
    ]
  },
  "es_large": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "es_huge": {
    "tiers": [
      "freak",
      "total"
    ]
  },
  "es_hooded": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "es_upturned": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "es_downturned": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "eye_black": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "eye_brown": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "eye_hazel": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "eye_green": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "eye_blue": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "eye_ice_blue": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "eye_amber": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "eye_grey": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ]
  },
  "fn_freckles": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ],
    "slot": "marks"
  },
  "fn_dimples": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ],
    "slot": "cheeks"
  },
  "fn_eyebags": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ],
    "slot": "eyes"
  },
  "ff_marks_12": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "marks"
  },
  "fn_cheekbones": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ],
    "slot": "cheeks"
  },
  "fn_fulllips": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ],
    "slot": "lips"
  },
  "fn_thickbrows": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ],
    "slot": "brows"
  },
  "fn_mole": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ],
    "slot": "marks"
  },
  "ff_nose_0": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "nose"
  },
  "ff_nose_1": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "nose"
  },
  "ff_nose_2": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "nose"
  },
  "fn_tinynose": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ],
    "slot": "nose"
  },
  "ff_lips_3": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "lips"
  },
  "ff_lips_4": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "lips"
  },
  "fn_widemouth": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ],
    "slot": "lips"
  },
  "ff_brows_5": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "brows"
  },
  "ff_brows_6": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "brows"
  },
  "ff_brows_7": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "brows"
  },
  "ff_ears_8": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "ears"
  },
  "ff_ears_9": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "ears"
  },
  "ff_teeth_10": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "teeth"
  },
  "ff_teeth_11": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "teeth"
  },
  "fn_pointychin": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ],
    "slot": "chin"
  },
  "ff_chin_13": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "chin"
  },
  "ff_forehead_14": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "forehead"
  },
  "fn_arrowbrows": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ],
    "slot": "brows"
  },
  "fn_flatcheeks": {
    "tiers": [
      "normal",
      "freak",
      "total"
    ],
    "slot": "cheeks"
  },
  "ff_chin_15": {
    "tiers": [
      "freak",
      "total"
    ],
    "slot": "chin"
  },
  "fh_none": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "fh_stubble": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "fh_beard": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "fh_goatee": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "fh_moustache": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "fh_pencil": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "fh_pushbroom": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "fh_braid": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "fh_handlebar": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_lampshade": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hair_bald": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hair_buzz": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hair_bowl": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hair_mullet": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hair_braids": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hair_pigtails": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hair_afro": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hair_punk": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_pompadour": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_beehive": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_dome": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hair_long": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hair_short": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_horns": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_softserve": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_sphere": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_mouse": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_wings": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_hedgehog": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_tufts": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_stairs": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_shelf": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_corkscrews": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_sidecoil": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_mushroom": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_curlblock": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_batwing": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_spirals": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hs_periwig": {
    "tiers": [
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hc_black": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hc_darkbrown": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hc_chestnut": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hc_ginger": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hc_red": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hc_blonde": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hc_platinum": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hc_grey": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hc_white": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hc_pink": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hc_lilac": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hc_blue": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "hc_green": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "df_hetero": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "df_facetattoo": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "df_septum": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "df_ears": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "df_slits": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "df_bleached": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "df_nobrows": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "df_grill": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "df_braces": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "df_scar": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "df_gems": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "df_elf": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "df_lashes": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "df_bandage": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "retro": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "sporty": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "y2k": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "theatrical": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "goth": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "suits": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "streetstyle": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "casual": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "acc_none": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ],
    "exclusive": true
  },
  "acc_glasses": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "acc_headphones": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "acc_jewelry": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "acc_hat": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  },
  "acc_bag": {
    "tiers": [
      "normal",
      "freak",
      "total",
      "insects",
      "frogs",
      "cats",
      "dogs",
      "capybaras",
      "birds"
    ]
  }
};
