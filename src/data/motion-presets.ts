/* Presets de movimento do Higgsfield Genjutsu (fonte: galeria Genjutsu da
   Higgsfield — abas "Higgsfield" e "Trending"). Cada preset carrega o vídeo de
   referência (driving video) usado para transferir o movimento para o
   influencer, além da thumbnail e do preview em vídeo. */

export type MotionKind = "motion_transfer" | "object_swap";

export type MotionPreset = {
  id: string;
  name: string;
  kind: MotionKind;
  category: "higgsfield" | "trending";
  drivingVideo: string;
  thumbnail: string;
  preview: string;
};

const CDN_T = "https://d2ol7oe51mr4n9.cloudfront.net/content_user_id";
const CDN_C = "https://d8j0ntlcm91z4.cloudfront.net/community-presets";
const CDN_H = "https://cdn.higgsfield.ai";

const t = (id: string, name: string, kind: MotionKind, drive: string, thumb: string, prev: string): MotionPreset => ({
  id,
  name,
  kind,
  category: "trending",
  drivingVideo: `${CDN_T}/${drive}.mp4`,
  thumbnail: `${CDN_C}/${thumb}/generation.webp`,
  preview: `${CDN_C}/${prev}/generation-genjutsu-h264-600-v1.mp4`,
});

const h = (id: string, name: string, kind: MotionKind, drive: string, thumb: string, prev: string): MotionPreset => ({
  id,
  name,
  kind,
  category: "higgsfield",
  drivingVideo: drive.startsWith("http") ? drive : `${CDN_T}/${drive}.mp4`,
  thumbnail: thumb.startsWith("http") ? thumb : `${CDN_H}/higgsfield_multiplier_video_explore_variant/${thumb}.webp`,
  preview: prev.startsWith("http") ? prev : `${CDN_H}/genjutsu/preview/genjutsu-h264-600-v1/${prev}.mp4`,
});

export const MOTION_PRESETS: readonly MotionPreset[] = [
  // ----- Trending -----
  t("45d8395e-e42f-45dd-9d88-838090afec06", "Synchronized Crowd Bow", "motion_transfer", "c7ee4157-a488-57fc-b8f8-f78612095419", "36a22d44-a050-4918-996b-0cfb4e023944", "fb3c960e-25b4-4ad9-badb-cdd33a3088de"),
  t("e3e35192-5570-488e-bb55-dc2073a84e62", "Seaside Couple Recast", "motion_transfer", "42aa2b18-082b-463c-a876-22530af65b36", "faffc913-2f5d-4e88-8cf9-da22bba9eb80", "faffc913-2f5d-4e88-8cf9-da22bba9eb80"),
  t("8aaaf361-77c4-4cd5-9956-cde2233274da", "Jersey Detail Showcase", "motion_transfer", "81f666bf-cfb1-59b5-95c2-98e495387171", "f4a28409-d394-4f5b-a6c4-2fcc1c6f5022", "f4a28409-d394-4f5b-a6c4-2fcc1c6f5022"),
  t("d7739fbb-1733-47a4-b76b-74bbcd66221d", "Urban Style Rotation", "motion_transfer", "662abc9f-d5b9-52ff-843f-ca4fdaa7eecc", "99bb8459-bbd9-4125-a292-1db8471a38fd", "f5c8c427-8ea6-4f87-98e3-6522e841cdc5"),
  t("002aa10f-5aec-40b3-b57d-00bce1a67d45", "Street Style Rotation", "motion_transfer", "71f576ac-a0f2-56ba-b81f-5f060b3e98b1", "c9061757-f8cb-4d2e-aa5d-b7e1355f4b7c", "c9061757-f8cb-4d2e-aa5d-b7e1355f4b7c"),
  t("31d92121-698b-4170-9414-e51b99c6bd49", "Arcade Identity Swap", "motion_transfer", "a1347c8f-4cf5-52f7-8fd2-78e4ab8ac833", "49d46998-1b15-4150-8a01-801b59207d33", "49d46998-1b15-4150-8a01-801b59207d33"),
  t("e348b6e4-b5e0-4c13-8840-0a11a1941dd0", "Urban Suit Swapping", "motion_transfer", "a0a17324-34ad-5395-8fca-3b68fb367735", "94720066-671d-4cd4-9917-e016baab4788", "4f22fae1-8060-4384-8749-aef48402821a"),
  t("4840d5f3-b56e-4892-8b10-8e7157c5ce2e", "Nightclub Character Swap", "motion_transfer", "fb73810d-9ffe-5660-bbac-561099edddfa", "703c2903-e4fc-48ad-9c6b-b74593d9097f", "703c2903-e4fc-48ad-9c6b-b74593d9097f"),
  t("964af097-9775-4d30-8fc9-2661b963bf05", "Supercar Interior Swap", "object_swap", "49b2ac64-b8bb-5d6f-9012-c2d0f2655f0f", "7107be64-034b-4201-bcd9-66028f24ad89", "7107be64-034b-4201-bcd9-66028f24ad89"),
  t("b494f897-2d61-4d57-8cf3-3c4d1a78e784", "Stage Performance Recast", "motion_transfer", "5891ff8c-b2d5-5f04-8776-0ef0b0b3d5e6", "dd8b0cfa-141a-488e-8835-75b7ff73e747", "dd8b0cfa-141a-488e-8835-75b7ff73e747"),
  t("e33a4d8c-3850-4003-89e4-6e8a67d7ca5d", "Orbital Room Sweep", "motion_transfer", "0f8e2123-5274-543e-ad1b-bd9081404ff3", "790fbe2e-a77d-4d3b-ba41-2221a7e0fbc9", "8599018c-0ff0-448e-b2f3-84ddb575a55d"),
  t("c9e47e98-8a4b-4f94-902a-655d0b6b0dd2", "Poodle Dance Crew", "motion_transfer", "85198a80-ae94-531d-9e52-fe4ea268ca4e", "fe05b7d9-e688-4ee4-bdcc-4c935b62b1cc", "fe05b7d9-e688-4ee4-bdcc-4c935b62b1cc"),
  t("984adfbe-282d-41b3-b247-45e04f0eaf64", "Automotive Orbit Showcase", "motion_transfer", "9411b893-369c-5537-8b04-675e588918aa", "53176ecc-2529-4d6c-9f16-c28cde7b79f3", "3f242781-ca2a-4990-8a54-ec997e169e30"),
  t("082a30cc-9e6d-42ce-a491-b689baa75449", "Architectural Brand Swap", "motion_transfer", "88881cc1-4ee6-50e2-afaf-b70ad54b768f", "eabea462-0f5f-47bf-a8be-7a80d6790e04", "eabea462-0f5f-47bf-a8be-7a80d6790e04"),
  t("648456fb-f990-4083-9ba4-53bb05785de6", "Night Fuel Drive", "motion_transfer", "a556a170-367c-53e9-adae-8dc9bc31a566", "ffab8a60-784d-46b2-a3f0-e76a1c6ec022", "3aaaf1aa-dc25-4346-a9e0-dd84393e2631"),
  t("32c8064b-325f-4145-b9b0-ed2e9eb24eb3", "Studio Rap Performance", "motion_transfer", "5529dbe5-ffb3-597a-9fab-1c7f656e0629", "695bd756-53a2-405c-95c8-d91b7723ee2f", "695bd756-53a2-405c-95c8-d91b7723ee2f"),
  t("016532fa-cb9e-4473-9bc4-f623a2ef340b", "Convertible Car Singalong", "motion_transfer", "db897aec-29a0-5f9d-9b30-e3a66eb06533", "6ac6c867-d20b-4819-b1a5-ac169fe273ea", "003f2cf9-2413-4ef9-a636-b87d5c14c484"),
  t("6bc8a600-91bc-4e8f-85b7-8dd4f87b9c5a", "Influencer Rhythm Recap", "motion_transfer", "1d026375-cabe-5419-941e-cff38879a565", "8bad8b1f-a706-4150-a28f-4afa6bc67e12", "8bad8b1f-a706-4150-a28f-4afa6bc67e12"),
  t("6c1344ca-cda1-4161-9fa3-441c68d20b42", "Convertible Head Bob", "motion_transfer", "71341954-a9c8-5ea5-b537-b9ca05fb6ed0", "cd3a84cc-72a2-4468-b866-075b5cf36816", "cd3a84cc-72a2-4468-b866-075b5cf36816"),
  t("e286b3fd-ca08-4bc1-a797-4163757380a5", "Glow Punch Reveal", "motion_transfer", "682b177b-8c03-5515-b664-2188bd1e304d", "91cac9df-b7e1-4fa0-9828-270d1fb6ac92", "48c24d0c-4a17-4bdb-b94f-03081562ea1d"),
  t("073430de-79f7-4d81-91f1-5853ece953c1", "Feline Dance Creator", "motion_transfer", "d9903bb6-05ce-5199-a6a6-8aff5a1dcfaf", "4eaf57db-0fae-4df0-be14-7ab68703e42d", "2b4d83b9-075d-4fe2-8fbf-682482e43c0c"),
  t("d94c0edb-a0b8-4d42-9597-b283947997d3", "Pet Zoom Montage", "motion_transfer", "500e69d0-59ec-5a6f-ab36-b4229ac161aa", "3252260e-a996-45ed-886a-f41080383526", "c5eb2df5-7a6f-4be2-b7c9-880b807c05cf"),
  t("b71b1918-4e62-4b0d-8e99-2c09c3589bd4", "Nightclub Balcony Observer", "motion_transfer", "183ed5f3-ed4f-5a95-be6d-67dc9f11c5e4", "b1a43a80-c2c6-4e32-83a7-667da06be516", "b1a43a80-c2c6-4e32-83a7-667da06be516"),
  t("b41c470c-6a0c-43d0-8530-65ae30d8d69c", "Park Walk Recast", "motion_transfer", "f43c5260-cbb1-5691-88a5-a744dfaa6039", "e1e4c99e-d6e4-4421-982e-7444d115c85c", "e1e4c99e-d6e4-4421-982e-7444d115c85c"),
  t("340e825d-dd9b-4497-8d3f-355277600042", "Roadside Celebration Flow", "motion_transfer", "07719846-c1d3-5334-a1e1-c5b9ce886342", "a3414322-4762-40b3-b24b-85e8f81aa855", "a3414322-4762-40b3-b24b-85e8f81aa855"),
  t("4629ad8b-190c-4bbf-830f-9ba33462de07", "Commercial Product Orbit", "motion_transfer", "8218dbd5-9f29-5a47-b8cd-2adf902db16b", "2da351ed-bc84-43ca-9aeb-6e82a7d382c1", "2da351ed-bc84-43ca-9aeb-6e82a7d382c1"),
  t("f7a7dde4-8e52-4ade-9a17-8357344cf819", "Currency Showoff Swap", "object_swap", "b1bc94c7-6d2c-5183-a425-693b380fc206", "151952e8-e528-49fb-a8da-cbd165a4a9b5", "151952e8-e528-49fb-a8da-cbd165a4a9b5"),
  t("8dae4939-0d27-4c1f-807e-255ab025a89a", "Suit Piano Session", "motion_transfer", "39a92d6c-c477-5268-9186-adc23d42ac78", "b144795b-09b8-4061-b290-41e947682a4e", "b144795b-09b8-4061-b290-41e947682a4e"),
  t("e5a74aa6-cacd-4da6-98f8-a967c86abdc0", "Urban Dance Trio", "motion_transfer", "39097864-5b5b-5a3d-b9a9-be2a880c3b03", "ecd6472b-cc52-4603-84a3-bed5c6c9d606", "48acc151-118b-4c6b-b222-0c1b642b47b2"),
  t("b953a9f2-86df-4e92-b42f-5193dc5553ae", "Cloud Skydiving Leap", "motion_transfer", "56a06184-9272-567b-9dfc-21f0f30eac17", "b1a890fc-bd3f-41e0-b16e-e7e322a599e1", "b1a890fc-bd3f-41e0-b16e-e7e322a599e1"),
  // ----- Higgsfield -----
  h("27182599-2cee-4b27-be1a-d13e9d713d37", "Countryside Duo", "object_swap", "baed0aeb-20d0-54f8-99c5-b4b0cb3a2f66", "54b6f52b-08b2-5acf-9557-2e599560acd8", "90d01517-46a5-467d-a37e-b2e18b401386"),
  h("735fdf1a-e36a-4f2c-be5e-eb3064f53ede", "Orange Jacket", "object_swap", "000f949b-2131-4fd7-b64e-d6547b9bb722", "c045b52b-ab93-5d96-8e2b-72115697cb50", "76933ec2-b002-4446-8713-180f60286ad7"),
  h("f8112d7a-5f01-4752-bba7-dfffd3c5ef09", "Dance Duo", "object_swap", "fa1bacd5-1229-5dd4-bdc2-181573b7d922", "9650072f-7ed8-5c91-bc2f-edc3a30ba02e", "91e73b88-b2e6-48cb-964c-e8e9cd208c3d"),
  h("93e97a97-d364-4682-816d-7e11697bb289", "Umbrella Transformation", "motion_transfer", "4380f3a5-c5a9-5876-bd0b-a6415108fc05", "e1db4f4b-3101-5151-91bf-a06be7a8a316", "f4031d7d-2d6a-4883-b1c4-1300b6e2611e"),
  h("5fcd3deb-8a52-4a31-b660-14df5408b54a", "Selfie Walk", "motion_transfer", "fcffb22c-cbf8-43d0-b9b6-351815063c73", "1bc47dfd-2af0-509b-bd76-3896ec07bf3d", "7f762557-d6d2-456d-9041-d4972d7c3928"),
  h("c0709c7a-e057-401f-8a0f-ee9cfec4d8ed", "Anime Times Square", "object_swap", "e00d85ab-fd35-52a6-80fd-bac7b262b408", "067a9f92-94b2-5e63-accf-2c57fe1a0cdf", "cdf35c08-c873-4853-b752-bc2e347db74d"),
  h("ea73209c-6010-41fd-b368-be9b515b47a6", "Couple Recast", "object_swap", "11a42a29-a28d-53c4-be16-11b10e0115cb", "f0ad452c-2254-54cb-932e-d85d0b06dca7", "fd9d42a8-2d1d-494f-8116-787f86aa21e6"),
  h("b4e5ab10-b5fa-469b-a7f9-4c8b17ad58a8", "Magenta Routine", "motion_transfer", "bc92d258-1b65-5ff0-9c1c-ab73bde1ba58", "d34e684b-0ed7-50fa-befb-d550e7a43881", "f1469b50-adf3-44a5-b9f2-fa974feb269a"),
  h("24d7ae76-1bd8-46ff-b637-e1bb5b31d6b6", "Clone Recast", "motion_transfer", "baa09269-dfe6-50eb-a7f6-af306a0130a6", "24daa737-06d4-530d-b2ff-18f0eeb2c289", "06964c76-f916-46de-bdeb-b71cbd534404"),
  h("14aeef88-284f-4a50-83b3-979893207ab6", "Desert Duo", "object_swap", "b865cef0-0fb4-543b-bb53-a7f81b97f24d", "08edcef0-2205-5490-a4e3-014f32e77587", "415c0af7-f119-4caa-8a75-f5f18ba930ce"),
  h("0086596a-f988-4aa7-9dcf-b4eb09ff4891", "Handbag Slide", "motion_transfer", "138dfbfc-e5fd-5393-be7f-8e337590ce28", "f32779dd-b4be-5f1d-ac1f-71f59b92d476", "c7ec54ee-5d28-443b-b739-7ae9eed1c6b0"),
  h("2749d6b3-863a-46cb-8ea2-24cb81357974", "Golden Gown", "object_swap", "042ca354-7a8e-583c-889e-472b65ea6a39", "167113f5-32ca-5c5f-ae3f-7f8e7599e964", "b7b23650-16b2-4f6f-bebc-9fe02d89ade9"),
  h("09331738-7cbf-4231-a64c-c56ee80b16e7", "Patchwork Runway", "motion_transfer", "188a7a57-3e17-5313-9c1a-95f12e0ff2a3", "80918ab3-d0cf-5c86-af99-29d53184edf0", "717aa444-7588-4e7a-b36c-22811309da25"),
  h("35533f73-a948-416a-8c40-9bcfc047bbe3", "Pink Street Runway", "motion_transfer", "53792492-24fe-5e9b-83e8-6a05946b9236", "33ab59ac-cee3-57eb-95ce-5e754de9f021", "c72a39c1-324d-443e-af18-5e940520e63a"),
  h("132dfd2f-e05a-4643-9eae-df7bf5530b88", "Toronto Recast", "object_swap", "dbc43364-fbef-528a-8511-20e3ddc46057", "06aaeffd-33c0-5add-a61c-eacf299154fa", "f26996f6-73d4-44b0-a91c-1d0f01b20c14"),
  h("c3bbb1b7-1e34-4210-a7fa-b03600a77543", "Cat Performer", "motion_transfer", "01075d0b-ce45-5a53-853c-6bf1feb96635", "a3177c9f-c068-54bb-96b2-abc85054ef9b", "0d5ccefc-4f1b-4d09-bc37-84a70dad123a"),
  h("921847b5-ee14-4075-be9a-b3d6de70ba50", "Playroom Recast", "object_swap", "ef6d5426-400d-5dad-94d0-cd5ba44c3061", "56475b81-bfc4-5cf1-ace4-902c5c0797e3", "bc744e57-b2a6-45fb-bf26-bd72c3d523bb"),
  h("2dd8d321-74f8-4ae2-8dcf-5ded711d7299", "Streetwear Recast", "object_swap", "ef223cc5-177f-5b15-ba9c-ed62197b3b1f", "03252833-d6bb-5a61-95df-a199d9fe2a5d", "dfdb144c-de5e-47e8-b1d8-c50ca69dedca"),
  h("ffe99d9d-7211-4410-b764-94716a0caaec", "Urban Motion", "motion_transfer", "https://d20rwh69pn04qo.cloudfront.net/user_3Bu5JuVtOLeUf9Tqr2GbRxGUfPp/669e3847-eac1-4c3c-bc24-8537b4fc5599.mp4", `${CDN_H}/genjutsu/video-explore/01/edit/c2394654-9775-4512-af95-d60250cfaabf.webp`, "5c33ea0b-81e0-4e9e-9138-87a648d35ad9"),
  h("db44da87-362b-48b9-b71a-28aa1b6a144d", "Multi-Scene Recast", "motion_transfer", `${CDN_H}/higgsfield_multiplier_how_it_works_reference/fe10e23c-1cf1-4f57-9207-e21708bf5a80.mp4`, "4a716a67-a71a-4496-9df6-d6d337b996d1", `${CDN_C}/1eab1a56-2e44-4bb6-bf9a-af78e243b4eb/generation-genjutsu-h264-600-v1.mp4`),
  h("5670a83d-cf1a-4038-9676-853e40279695", "Diner Recast", "motion_transfer", `${CDN_H}/higgsfield_multiplier_how_it_works_reference/66b8da7d-2f79-46d2-a613-442ab88360c7.mp4`, "cd4a1d48-8b82-41a5-9df0-532e5e32c170", `${CDN_C}/74137e06-a512-4804-a00a-d4df696662a1/generation-genjutsu-h264-600-v1.mp4`),
  h("ca9ee0b7-5d88-444c-b562-e373a3be79eb", "Character Recast", "motion_transfer", "https://d20rwh69pn04qo.cloudfront.net/user_3HBBqUL3N7zkGsMu9UdbSI5yqe4/eae4e07e-ddd5-489b-86ad-5f26b9397309.mp4", `${CDN_H}/genjutsu/video-explore/03/edit/27ee6ea4-78ab-445f-b5c0-15083c969a95.webp`, "f47db038-5bb2-4219-9ae5-840f48747e64"),
  h("8082f578-5d63-43c0-ae93-559e8e381880", "Scene Recast", "motion_transfer", "https://d20rwh69pn04qo.cloudfront.net/user_3HBBqUL3N7zkGsMu9UdbSI5yqe4/d24dbd44-892c-4326-9c22-be9b4fe4a478.mp4", `${CDN_H}/genjutsu/video-explore/04/edit/29cd2db0-0173-4e02-a0a0-9f3cf98f6934.webp`, "9c8a1d33-12e1-4fbd-a799-7cfe121f06b9"),
  h("e5f6fcc0-53dd-4c02-a172-57d37b2ca727", "House on Fire", "motion_transfer", "https://d20rwh69pn04qo.cloudfront.net/user_3Bu5JuVtOLeUf9Tqr2GbRxGUfPp/b6e81d09-2cab-47f5-a2bf-989053df37cd.mp4", `${CDN_H}/genjutsu/video-explore/06/edit/0f28d1e3-fc59-4990-a4c7-d20a8003f207.webp`, "a410e77e-126a-43a7-ac29-79290d169f81"),
  h("55840397-8f78-4df7-b6fc-1dd6da21d538", "Commercial Recast", "motion_transfer", `${CDN_H}/genjutsu/video-explore/07/original/e0dc7162-3acf-42b2-ae7f-850b6551de4c.mp4`, `${CDN_H}/genjutsu/video-explore/07/edit/79ea82de-3cb9-437c-af71-a59c239873f2.webp`, "0e4b5630-3231-4ba8-898d-567552d22344"),
  h("868e53b0-7093-4fe6-9dce-ec30f07e0009", "Infinite Zoom", "motion_transfer", `${CDN_H}/genjutsu/video-explore/08/original/9602f2a6-dec2-457b-b0c6-561a93eec4d9.mp4`, `${CDN_H}/genjutsu/video-explore/08/edit/9c76dbd0-6ae5-4566-8c32-9c09c5a57186.webp`, "1a88da35-b73b-4822-9497-9436b331d532"),
  h("f93150c5-4018-43c4-b4fa-4bd83c0c62e0", "Ride Recast", "motion_transfer", `${CDN_H}/genjutsu/video-explore/09/original/37492da1-936c-4cab-b12a-802475f8a151.mp4`, `${CDN_H}/genjutsu/video-explore/09/edit/08e0eba9-4a81-410b-b65d-a55f55509d0a.webp`, "3f2e20d2-684b-4902-bd97-a7653d43b73a"),
  h("84024aa7-f6df-42cf-b703-76057842aa87", "World Shift", "motion_transfer", "https://d20rwh69pn04qo.cloudfront.net/user_3HBBqUL3N7zkGsMu9UdbSI5yqe4/a8104dea-8a8d-4f44-81ad-93fbcc3a27ab.mp4", `${CDN_H}/user_3HBBqUL3N7zkGsMu9UdbSI5yqe4/hf_20260829_231228_7f44830d-46b4-409b-b017-29768875ed93_thumbnail.webp`, `${CDN_C}/4f0494b8-c06d-4c92-b5fb-c90a4474a06d/generation-genjutsu-h264-600-v1.mp4`),
  h("aea2047f-e12f-4a30-ab3a-184bca69d777", "Fight Recast", "motion_transfer", "https://d20rwh69pn04qo.cloudfront.net/user_3HBBqUL3N7zkGsMu9UdbSI5yqe4/734e9262-fe54-474c-bc7e-b685ef22179e.mp4", `${CDN_H}/genjutsu/video-explore/11/edit/58825ba0-5778-4402-80af-b8c1bc71db2b.webp`, "8e919928-0027-4ba1-8ceb-e8b23dd83a44"),
  h("38f851a5-3442-4e9b-924b-27df270cb36d", "Cats in Motion", "motion_transfer", `${CDN_H}/genjutsu/video-explore/12/original/37f00e99-165d-49a5-9182-fb1b688bbd14.mp4`, `${CDN_H}/genjutsu/video-explore/12/edit/8a402c2d-0963-4434-b6a7-3ea5d14d39b7.webp`, "2f1cfbbc-13c0-42fe-ba99-0a23b68c9177"),
];

export function getMotionPreset(id: string): MotionPreset | undefined {
  return MOTION_PRESETS.find((p) => p.id === id);
}
