// Dados da empresa usados nas páginas legais (Termos e Privacidade) e no site.
// Campos vazios não aparecem no site, mas a lei exige a identificação de quem
// presta o serviço (denominação, NIF e morada): preencha-os assim que possível.
export const empresa = {
  nome: "SolidLynx",
  // Denominação legal, ex.: "SolidLynx, Lda." ou o nome do empresário em nome individual.
  denominacao: "",
  nif: "",
  morada: "",
  // Comarca do foro para litígios, ex.: "Porto". Vazio: "tribunais portugueses".
  comarca: "",
  emailGeral: "geral@solidlynx-automation.com",
  emailSuporte: "suporte@solidlynx-automation.com",
  site: "solidlynx-automation.com",
};

// Sempre que o texto de um documento mudar, suba a versão e a data (AAAA-MM-DD).
export const documentos = {
  termos: { versao: "1.0", vigor: "2026-10-24" },
  privacidade: { versao: "1.0", vigor: "2026-10-24" },
};

// "SolidLynx, Lda., NIF 123456789, Rua X, Porto" (só com os campos preenchidos)
export const identificacao = [
  empresa.denominacao || empresa.nome,
  empresa.nif && `NIF ${empresa.nif}`,
  empresa.morada,
].filter(Boolean).join(", ");

export const emFalta = Object.entries({ denominacao: "denominação legal", nif: "NIF", morada: "morada" })
  .filter(([k]) => !empresa[k as keyof typeof empresa])
  .map(([, v]) => v);
