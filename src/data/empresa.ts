// Dados da empresa usados no site e nas páginas legais (Termos e Privacidade).
// Campos vazios não aparecem no site.
export const empresa = {
  nome: "SolidLynx",
  denominacao: "",
  nif: "",
  morada: "",
  // Comarca do foro para litígios. Vazio: "tribunais portugueses".
  comarca: "",
  // Email único da empresa: contactos, suporte, privacidade e cancelamentos.
  emailGeral: "geral@solidlynx.pt",
  site: "solidlynx.pt",
};

// Sempre que o texto de um documento mudar, suba a versão e a data (AAAA-MM-DD).
export const documentos = {
  termos: { versao: "1.5", vigor: "2026-11-15" },
  privacidade: { versao: "1.5", vigor: "2026-11-15" },
};

// Identificação da empresa (só com os campos preenchidos).
export const identificacao = [
  empresa.denominacao || empresa.nome,
  empresa.nif && `NIF ${empresa.nif}`,
  empresa.morada,
].filter(Boolean).join(", ");

