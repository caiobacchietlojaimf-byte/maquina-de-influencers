/* Efeitos virais (galeria "Viral" da Higgsfield). Alimentam a página de
   Vídeos Virais como tendências prontas para duplicar com um influencer. */

export type ViralEffect = {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  preview: string;
  /** Métricas ilustrativas de alcance da tendência (TikTok/Instagram). */
  views: number;
  platform: "tiktok" | "instagram" | "youtube";
  tags: string[];
};

const V = "https://cdn.higgsfield.ai/viral_hub";
const e = (
  id: string,
  name: string,
  description: string,
  thumb: string,
  prev: string,
  views: number,
  platform: ViralEffect["platform"],
  tags: string[],
): ViralEffect => ({ id, name, description, thumbnail: `${V}/${thumb}.webp`, preview: `${V}/${prev}.mp4`, views, platform, tags });

export const VIRAL_EFFECTS: readonly ViralEffect[] = [
  e("fb6ca8f7-493e-42e6-9e0d-f3e2e695825d", "Floating fall", "Cai de costas enquanto seus pertences flutuam no ar; a câmera passa por close-ups do produto antes da queda continuar. Feito para reveals de produto e edições surreais em slow motion.", "151664fa-7f7f-43d6-80fa-4683104a3c02", "d877f71c-d2f3-44df-9317-f3ce6889bcb6", 48200000, "tiktok", ["produto", "slow motion", "surreal"]),
  e("8b8d053d-08ff-436c-9767-315efe5f0cfc", "Vanish", "O corpo some na hora e a roupa vazia desaba no chão. Feito para ganchos virais, reveals cômicos e efeitos visuais surreais.", "a9944d26-47dc-463f-b4d6-446c371ae2f7", "d63d47dd-d00f-42c8-9c45-9bddd3df7a38", 92700000, "tiktok", ["gancho", "comédia", "vfx"]),
  e("a5e06af0-626e-4634-a523-76bf57c7b3a8", "Eyes in", "A câmera mergulha no olho do personagem, atravessa a pupila e transporta o espectador para uma cena nova. Feito para narrativas surreais e fluxo visual hipnotizante.", "5354ce11-c68c-45a0-8a97-5aab94f52833", "dba03734-6e8a-4337-acb4-17ce943563d8", 31400000, "instagram", ["transição", "surreal", "narrativa"]),
  e("dd509a98-fffe-4b30-915b-3fd93b31bbc9", "Cutout", "O cenário se despedaça em camadas recortadas, revelando um vazio branco ao redor do personagem antes de voltar ao lugar. Feito para moda surreal e transições arquitetônicas.", "b5c90864-c3c5-4b14-87a0-3739250fd00b", "a64711ac-93b8-46ee-a9ce-37ee5c18e148", 18900000, "instagram", ["moda", "colagem", "transição"]),
  e("23507548-cd71-423b-a5fd-0de1b0a09222", "Wild ride", "Órbita de câmera em alta velocidade ao redor de um sujeito girando ou derrapando, do topo ao rés do chão, sempre travada na ação. Feito para automotivo e clipes de alta energia.", "99aa3365-5ae0-4616-9722-ce0dc087607d", "8cd9e3fc-8e4f-4071-abff-8934f3381507", 27300000, "youtube", ["ação", "carros", "câmera"]),
  e("af71aba0-66b8-42a2-a33d-d08aa7ec5836", "Lidar transition", "O mundo inclina ao redor do personagem, mandando objetos soltos deslizarem enquanto ele permanece calmo no lugar. Feito para moda surreal e distorções de gravidade.", "b703fc00-16e8-4036-acc2-6519ab82bf03", "9a8e4804-9e49-4a3b-8087-021ba9b447cf", 12100000, "tiktok", ["gravidade", "moda", "surreal"]),
  e("3e568b72-8d27-4b0d-a772-399137f18850", "Smash and grab", "A câmera enquadra o produto pela janela do carro, o personagem quebra o vidro e pega o produto, corta para um tracking shot rápido da fuga. Feito para reveals ousados de produto.", "4a2315f6-57e1-4378-82a5-598ddbbfbbcb", "c32886ee-2d15-4697-a366-041a9deaffe2", 22800000, "tiktok", ["produto", "ação", "ads"]),
  e("ff501ca6-1d60-4ab4-8675-6273adfd977b", "Incline", "O mundo inclina ao redor do personagem, objetos soltos escorregam enquanto ele fica parado. Feito para moda surreal, distorções de gravidade e clipes alternativos.", "30142c8a-46ee-4930-aca3-6fa5321dd84a", "bade6252-7039-42eb-a50c-45c142c7f70f", 15600000, "instagram", ["gravidade", "moda"]),
  e("32650589-e3dc-48c7-b26d-c1116e3acf9d", "Clones", "Clones idênticos aparecem pela cena espelhando os movimentos do personagem enquanto o original caminha até a câmera. Feito para moda surreal e performances sincronizadas.", "e56a428d-6795-49f2-a456-6457ce90b346", "9cedf121-64a9-4eb9-88e9-608844ff1929", 64500000, "tiktok", ["clones", "dança", "moda"]),
  e("6821208a-3078-4431-92df-8f2e46a833f4", "Infinite clones", "Plano aberto fixo onde uma pessoa e seus clones idênticos saem sem parar de um carro pequeno e correm em todas as direções. Feito para comédia e clipes.", "a54ccc43-8866-4b56-89ba-35f199ab977f", "04df3d28-67de-464a-9426-55568d4ee55c", 38900000, "tiktok", ["clones", "comédia"]),
  e("2e215b1a-7df1-4c96-a97a-baf611f7d38e", "Selfception", "Versões infinitas do personagem se repetem uma dentro da outra enquanto a câmera dá zoom contínuo na miniatura que ele segura. Feito para ilusões recursivas e loops de zoom.", "495d9e85-0417-47d9-9e0a-722ace805852", "6ef62a07-2609-4693-8225-e6263b76afab", 41200000, "instagram", ["loop", "zoom", "ilusão"]),
  e("d43818b0-7c5c-4c19-a67c-2b38beb5367c", "Act natural", "Efeito cinematográfico de manipulação do tempo: o personagem e objetos ao redor ficam suspensos no meio da ação enquanto o resto do mundo segue em tempo real.", "17cc1333-9822-442c-adaa-d208c59e3e01", "7a261cff-8d6c-4bab-84e7-515364061f3e", 29800000, "tiktok", ["tempo", "cinema", "pausa"]),
  e("ddb12fd4-5bbf-4bb1-800b-7d409f3066b5", "Monster dab", "Uma criatura colossal de fantasia cai do céu atrás do personagem, combinando perfeitamente com o estilo visual. Feito para reveals de criaturas e momentos dramáticos.", "afd75c6a-1880-4cc0-bab9-576c4d1e7ff1", "0ab0fb19-95df-44c7-9b92-6804122e02ff", 56300000, "tiktok", ["criatura", "fantasia", "reveal"]),
  e("c277871a-938b-4c09-b825-41c217e7f727", "Street colossus", "Efeito de escala cinematográfico que transforma você em um gigante integrado a uma metrópole. Feito para edições urbanas surreais e impacto visual épico.", "5e67ff0a-60f7-4c0a-8ace-18c9bf3e5426", "e0278141-12c9-4139-91eb-b4294d833ed9", 73100000, "youtube", ["gigante", "cidade", "épico"]),
  e("262d1281-9e6e-4530-b1b2-ce74f7a33df9", "World morphing", "Todo o cenário se ergue e se dobra ao redor do personagem parado, transformando a paisagem em um casulo que desafia a gravidade. Feito para mudanças de cena alucinantes.", "0abb112e-068d-45e4-acea-9c8c44a16781", "950efc04-6ae6-4b31-bfa5-83c87244014c", 24700000, "instagram", ["surreal", "cenário"]),
  e("568a5b0d-f82d-4441-b833-a14c48a0d815", "Studio slide", "Várias cópias de uma pessoa aparecem em escalas, ângulos e profundidades diferentes no mesmo quadro, deslizando umas pelas outras em camadas 3D. Feito para reels de moda e lookbooks.", "05201733-c72f-43ed-8393-8b8cea28b8ce", "c129fb83-2014-4a37-a3f8-6c7dfeab0254", 19400000, "instagram", ["moda", "lookbook", "estúdio"]),
  e("93a606f8-87cb-4fb0-98a8-694d08f9b319", "High flip", "A câmera sobe acima do personagem e gira por cima, revelando um novo personagem e local do outro lado. Feito para trocas de cena e reveals cinematográficos.", "95cd0d73-4f3c-40d1-ac0b-c8668a99440b", "001156a7-cfdb-4e16-8f13-68c246ddc06c", 33600000, "tiktok", ["transição", "reveal", "câmera"]),
  e("7ca07da7-5471-48fa-80a7-97a29a7ec2bc", "Lacewalker", "Uma versão miniatura do personagem passa pelo seu eu gigante e se equilibra numa alça esticada entre bolsas enormes. Feito para ilusões de escala e campanhas de moda.", "ef3dfc4c-a4c2-44a0-af27-d005bd1c319d", "d806368c-0d8a-4a7b-b43a-8ff22fa64563", 14200000, "instagram", ["escala", "moda", "produto"]),
  e("acc07eb5-2d40-4ace-9789-48d5bf19639c", "Burning man", "Um duplo em chamas surge diante do personagem e estende a mão para um aperto, frente a frente com sua versão ardente. Feito para reveals surreais e clipes dramáticos.", "a1560137-597c-455a-be9e-9622cccf76a3", "c370022d-d99a-4cff-bb35-9d73b7a3a95d", 45900000, "tiktok", ["fogo", "duplo", "drama"]),
  e("bc0f007c-3319-405e-b1f4-341f65000e2b", "Melting", "O personagem derrete devagar em uma poça brilhante, roupa e acessórios esticando em fios líquidos antes de se juntarem no chão. Feito para transformações surreais.", "6ecca888-1780-46ae-a86d-a05b69b2fe34", "f661157c-af00-46f7-8b7c-6a7ae711ef98", 37800000, "tiktok", ["transformação", "surreal"]),
  e("eee3cd37-1072-428d-a921-a37c3735423c", "Boarding pass", "Transição de viagem que transforma sua caminhada em passarela global, trocando roupa e cenário a cada passagem de embarque gigante que você cruza. Feito para vlogs de viagem e lookbooks.", "45c263b5-7820-423c-97b5-c383e25e9ff9", "dcd67e05-0b1e-4475-9b6c-3f96e69c5384", 26500000, "instagram", ["viagem", "moda", "transição"]),
  e("6e822598-7221-4f89-9a7d-81bb812433d9", "Frozen in motion", "O personagem congela no ar enquanto pedestres e trânsito seguem se movendo naturalmente ao redor. Feito para cenas de rua surreais e momentos suspensos no tempo.", "4bd4d456-d335-42da-b6ca-d0d8b8dffcea", "59c46689-f756-4843-b298-f34b9761187e", 21300000, "tiktok", ["tempo", "rua", "moda"]),
  e("118138a4-5b5d-471e-a29f-69faa58aee5a", "Architecture wave", "Distorção arquitetônica massiva: enquanto o personagem se move no primeiro plano, prédios atrás dele dobram e ondulam como líquido. Feito para cenas urbanas surreais.", "13b4a006-8897-46d0-a00a-bcf3a4851c0d", "0cc7ac70-a981-406b-aac6-1d9fcc06e218", 17700000, "youtube", ["cidade", "surreal", "escala"]),
  e("4f46bb84-20f5-44d5-bee1-e1e2c0faa809", "Scrapbook collage", "Layout dinâmico de múltiplos painéis com um plano de corpo inteiro central e quadros menores mostrando detalhes em close ao mesmo tempo. Feito para vídeos de moda e lookbooks.", "9a24d748-3552-4c01-ad2c-38d547feb16e", "84f761d0-2033-417f-aee0-a2029cfb78fe", 11900000, "instagram", ["moda", "colagem", "lookbook"]),
];

export function getViralEffect(id: string): ViralEffect | undefined {
  return VIRAL_EFFECTS.find((v) => v.id === id);
}

export function formatViews(views: number): string {
  if (views >= 1000000) return `${(views / 1000000).toFixed(1).replace(".", ",")} mi`;
  if (views >= 1000) return `${Math.round(views / 1000)} mil`;
  return String(views);
}
