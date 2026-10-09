import { LegalPage } from "@/components/legal-page";
import { getSystemSettings } from "@/lib/commerce";
export const metadata = { title: "Exclusão de dados" };
export default async function DeletionPage() {
  const { supportEmail } = await getSystemSettings();
  return <LegalPage title="Exclusão de dados"><h2>Desconectar Instagram ou TikTok</h2><p>Acesse sua conta na Máquina de Influencers, abra Publicar e use Desconectar na rede desejada. Isso remove a conexão e impede novas publicações pela plataforma. Você também pode revogar a autorização nas configurações de aplicativos conectados da própria rede social.</p><h2>Excluir dados da plataforma</h2><p>Envie uma solicitação para <a href={`mailto:${supportEmail}?subject=Exclus%C3%A3o%20de%20dados`}>{supportEmail}</a> com o assunto “Exclusão de dados”, usando o e-mail cadastrado na conta. Informe se deseja remover uma conexão, determinadas mídias ou a conta completa. Não envie senhas nem documentos pelo e-mail.</p><p>Após confirmar a titularidade, informaremos o andamento e a conclusão da solicitação. Registros que precisem ser mantidos por obrigação aplicável ou prevenção de fraude terão acesso restrito. A exclusão na plataforma não remove conteúdos que já tenham sido publicados nas suas redes: esses conteúdos devem ser removidos na própria rede social.</p></LegalPage>;
}
