/* "Higgsfield Presets" da aba Explorar: cada card tem a imagem do influencer
   (poster) e o vídeo resultante do movimento aplicado. */

export type VideoPreset = {
  id: string;
  name: string;
  poster: string;
  video: string;
  /** retrato (9:16) ou paisagem (16:9) */
  orientation: "portrait" | "landscape";
  /** Rostos dos influencers usados no vídeo (avatars pequenos no card). */
  faces: string[];
};

const P = "https://static-public-media.higgsfield.ai/ai-influencer-video-presets/published";

export const VIDEO_PRESETS: readonly VideoPreset[] = [
  { id: "vp-1", name: "Glasshouse Walk", poster: `${P}/efbeedb8811098c6270aa3611907d695528efbd2926eac54dc901b084cd68af1`, video: `${P}/e89d6fd7f980f22421394a1a2998ef17b91c8996d6556a8cb5c62b31181303a9`, orientation: "portrait", faces: [`${P}/efbeedb8811098c6270aa3611907d695528efbd2926eac54dc901b084cd68af1`, `${P}/b732a945d46b7d12cfc2f84cbc3edd2c474b61766559f2fca51cc136df8a536a`, `${P}/3158660aec58b854e44c31ffc62eca1cdfa038800e69a28b49cf1c47e320869b`] },
  { id: "vp-2", name: "Frog Suit Stroll", poster: `${P}/f802377077652cccc1760ff31936ac2fca4dd8798af6de4901bf1453ea379c7a`, video: `${P}/6408aa82f6c0537ff17e7ddf01639decbf6103619cccdd9604031c3d9cbbdae0`, orientation: "portrait", faces: [`${P}/f802377077652cccc1760ff31936ac2fca4dd8798af6de4901bf1453ea379c7a`, `${P}/09d31752e2f7915334e082655c12c91ae312c06ce243178fbd1c7a1ec3e15436`, `${P}/86224bfb8e54229da3d600fc936b3031e7305abb7fe20893427b4a675e187b24`] },
  { id: "vp-3", name: "Street Trio", poster: `${P}/d7238d21b63c03aa52d047ea300149f67ff110438addc9f020eab02a9bd54acf`, video: `${P}/094f087a1d85bfce238b18f6117cff6c707ee2e713a3e7558e98988e4df3daab`, orientation: "landscape", faces: [`${P}/d7238d21b63c03aa52d047ea300149f67ff110438addc9f020eab02a9bd54acf`, `${P}/0e103a90ff725706f7dedc288c837cdb79a33da1c4d3ca5e543e223f462db94f`, `${P}/b0671e7ca2406be36aec4977cf25359e420b80b30e397abdb6e22bea9fa5e0ea`] },
  { id: "vp-4", name: "Stage Dancer", poster: `${P}/27238e01fedbb9a017232c26b9f3491c600c140f80980b76574c863e002facc1`, video: `${P}/62eb4c161b2e155f486dc7d4e6b671857ef7c325e7396a16bb65ef250b0215c9`, orientation: "landscape", faces: [`${P}/27238e01fedbb9a017232c26b9f3491c600c140f80980b76574c863e002facc1`, `${P}/880cbb3410f3ea1f6732de8ed22b2cbd2c0a46476bbf9465672abe3b35b5c420`, `${P}/342a18acf1a855694d3482d882f7515bea6751f4439c74d3c5d265fbd90e80aa`] },
  { id: "vp-5", name: "Runway Rotation", poster: `${P}/7343c9f6d5f933a1cd54da58e6dee0396e4928190cd36b51688a695bb10f4c95`, video: `${P}/8844ce50ef16ea2eb020168c0a3c06346dffb57d303c893bbe7fba3caa1c88d2`, orientation: "portrait", faces: [`${P}/7343c9f6d5f933a1cd54da58e6dee0396e4928190cd36b51688a695bb10f4c95`, `${P}/658cef80d2b939d80fee9c9ecf4de1081f38aa54da21ae3998c9b5e25279de20`] },
  { id: "vp-6", name: "Night Walk", poster: `${P}/c7d7a05c956358ee6982726f07f8798f0a4687502d40dc865549acf80dd23774`, video: `${P}/65626ca03e4fb63f53afe7932ded241b17d9b768eef38a6282d7a017746591a4`, orientation: "portrait", faces: [`${P}/c7d7a05c956358ee6982726f07f8798f0a4687502d40dc865549acf80dd23774`, `${P}/c17177c1f0f1a97afc5ddbe1f82427bd0dbf34c1dcce2d156e71605e14f1a77d`] },
  { id: "vp-7", name: "Studio Beat", poster: `${P}/e1357df67caa33a89e60702f1bf1f0b417f8d146fb4a9861eaad04c579685e9d`, video: `${P}/c35252c3bd6ba4815358da2893e781cea3b7c889c3d9aa2e52ecfff67fd11589`, orientation: "landscape", faces: [`${P}/e1357df67caa33a89e60702f1bf1f0b417f8d146fb4a9861eaad04c579685e9d`, `${P}/361645acbf60361c3bb426ba414e97e5335b94cc85e12a02c54ba779fe94b048`] },
  { id: "vp-8", name: "Rooftop Groove", poster: `${P}/b523ab437616206d01b00a917be5880d8e22613395d339414e5f2f5ab2f99ba0`, video: `${P}/b4b4bac313e33b9c0b5a2fcb85d07b689d40251b2e7ae21a8a08c4d276733047`, orientation: "portrait", faces: [`${P}/b523ab437616206d01b00a917be5880d8e22613395d339414e5f2f5ab2f99ba0`, `${P}/64502b1c3560bd0538b09dc21762146c56443eca8a08aa39aa789ad995018ff3`] },
];
