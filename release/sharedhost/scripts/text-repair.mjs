import { Buffer } from "node:buffer";

const DIRECT_REPLACEMENTS = new Map([
  ["Placas de v\uFFFDdeo", "Placas de vídeo"],
  ["Placas de v?deo", "Placas de vídeo"],
  ["Placa de v\uFFFDdeo", "Placa de vídeo"],
  ["Placa de v?deo", "Placa de vídeo"],
  ["v\uFFFDdeo", "vídeo"],
  ["v?deo", "vídeo"],
  ["V?deo", "Vídeo"],
  ["Notebooks e Port\uFFFDteis", "Notebooks e Portáteis"],
  ["Notebooks e Port?teis", "Notebooks e Portáteis"],
  ["Port\uFFFDteis", "Portáteis"],
  ["Port?teis", "Portáteis"],
  ["Mem\uFFFDria RAM", "Memória RAM"],
  ["Mem?ria RAM", "Memória RAM"],
  ["Mem\uFFFDria", "Memória"],
  ["Mem?ria", "Memória"],
  ["Perif\uFFFDricos", "Periféricos"],
  ["Perif?ricos", "Periféricos"],
  ["Acess\uFFFDrios", "Acessórios"],
  ["Acess?rios", "Acessórios"],
  ["Cat\uFFFDlogo", "Catálogo"],
  ["Cat?logo", "Catálogo"],
  ["cat?logo", "catálogo"],
  ["Servi\uFFFDos", "Serviços"],
  ["Servi?os", "Serviços"],
  ["servi?os", "serviços"],
  ["Servi\uFFFDo", "Serviço"],
  ["Servi?o", "Serviço"],
  ["servi?o", "serviço"],
  ["Aprova\uFFFD\uFFFDo", "Aprovação"],
  ["Aprova??o", "Aprovação"],
  ["aprova??o", "aprovação"],
  ["Aprova??es", "Aprovações"],
  ["aprova??es", "aprovações"],
  ["Condi\uFFFD\uFFFDo", "Condição"],
  ["Condi??o", "Condição"],
  ["condi??o", "condição"],
  ["Situa\uFFFD\uFFFDo", "Situação"],
  ["Situa??o", "Situação"],
  ["situa??o", "situação"],
  ["Descri\uFFFD\uFFFDo", "Descrição"],
  ["Descri??o", "Descrição"],
  ["descri??o", "descrição"],
  ["Observa??o", "Observação"],
  ["observa??o", "observação"],
  ["Observa\uFFFD\uFFFDo", "Observação"],
  ["observa\uFFFD\uFFFDes", "observações"],
  ["Observa\uFFFD\uFFFDes", "Observações"],
  ["Reposi\uFFFD\uFFFDo", "Reposição"],
  ["Reposi??o", "Reposição"],
  ["reposi??o", "reposição"],
  ["Invent\uFFFDrio", "Inventário"],
  ["Invent?rio", "Inventário"],
  ["invent\uFFFDrio", "inventário"],
  ["invent?rio", "inventário"],
  ["c\uFFFDdigo", "código"],
  ["c?digo", "código"],
  ["C\uFFFDdigo", "Código"],
  ["C?digo", "Código"],
  ["pre\uFFFDo", "preço"],
  ["pre?o", "preço"],
  ["Pre\uFFFDo", "Preço"],
  ["Pre?o", "Preço"],
  ["m\uFFFDnimo", "mínimo"],
  ["m?nimo", "mínimo"],
  ["M\uFFFDnimo", "Mínimo"],
  ["M?nimo", "Mínimo"],
  ["m\uFFFDdia", "média"],
  ["M\uFFFDdia", "Média"],
  ["Opera\uFFFD\uFFFDo", "Operação"],
  ["Opera??o", "Operação"],
  ["opera??o", "operação"],
  ["Calend\uFFFDrio", "Calendário"],
  ["Calend?rio", "Calendário"],
  ["calend?rio", "calendário"],
  ["Relat\uFFFDrios", "Relatórios"],
  ["Relat?rios", "Relatórios"],
  ["relat?rios", "relatórios"],
  ["N\uFFFDo", "Não"],
  ["N?o", "Não"],
  ["n\uFFFDo", "não"],
  ["n?o", "não"],
  ["Previs\uFFFDo", "Previsão"],
  ["Previs?o", "Previsão"],
  ["previs?o", "previsão"],
  ["Conclu\uFFFDda", "Concluída"],
  ["Conclu?da", "Concluída"],
  ["conclu?da", "concluída"],
  ["Pr\uFFFD-aprovado", "Pré-aprovado"],
  ["Pr\uFFFD-aprovada", "Pré-aprovada"],
  ["Pr?-aprovado", "Pré-aprovado"],
  ["Pr?-aprovada", "Pré-aprovada"],
  ["Refrigera\uFFFD\uFFFDo", "Refrigeração"],
  ["Refrigera??o", "Refrigeração"],
  ["refrigera??o", "refrigeração"],
  ["Placas-m\uFFFDe", "Placas-mãe"],
  ["Placas-m?e", "Placas-mãe"],
  ["placas-m?e", "placas-mãe"],
  ["Cart\uFFFDo", "Cartão"],
  ["Cart?o", "Cartão"],
  ["cart?o", "cartão"],
  ["Transfer\uFFFDncia", "Transferência"],
  ["Transfer?ncia", "Transferência"],
  ["transfer?ncia", "transferência"],
  ["Manuten\uFFFD\uFFFDo", "Manutenção"],
  ["Manuten??o", "Manutenção"],
  ["manuten??o", "manutenção"],
  ["c\uFFFDmera", "câmera"],
  ["C\uFFFDmera", "Câmera"],
  ["voc\uFFFD", "você"],
  ["Voc\uFFFD", "Você"],
  ["poss\uFFFDvel", "possível"],
  ["Poss\uFFFDvel", "Possível"],
  ["dispon\uFFFDvel", "disponível"],
  ["Dispon\uFFFDvel", "Disponível"],
  ["hist\uFFFDrico", "histórico"],
  ["Hist\uFFFDrico", "Histórico"],
  ["unit\uFFFDrio", "unitário"],
  ["unit\uFFFDria", "unitária"],
  ["Unit\uFFFDrio", "Unitário"],
  ["vis\uFFFDvel", "visível"],
  ["Vis\uFFFDvel", "Visível"],
  ["vis\uFFFDveis", "visíveis"],
  ["Vis\uFFFDveis", "Visíveis"],
  ["sa\uFFFDda", "saída"],
  ["Sa\uFFFDda", "Saída"],
  ["t\uFFFDcnico", "técnico"],
  ["T\uFFFDcnico", "Técnico"],
  ["pe\uFFFDas", "peças"],
  ["Pe\uFFFDas", "Peças"],
  ["gr\uFFFDfico", "gráfico"],
  ["Gr\uFFFDfico", "Gráfico"],
  ["aten\uFFFD\uFFFDo", "atenção"],
  ["Aten\uFFFD\uFFFDo", "Atenção"],
  ["\uFFFDltimo", "último"],
  ["\uFFFDltima", "última"],
  ["avan\uFFFDados", "avançados"],
  ["Avan\uFFFDados", "Avançados"],
  ["digita\uFFFD\uFFFDo", "digitação"],
  ["Digita\uFFFD\uFFFDo", "Digitação"],
  ["s\uFFFDo", "são"],
  ["S\uFFFDo", "São"],
  ["A\uFFFD\uFFFDes", "Ações"],
  ["Visualiza\uFFFD\uFFFDo", "Visualização"],
  ["visualiza\uFFFD\uFFFDo", "visualização"],
  ["est\uFFFD", "está"],
  ["Est\uFFFD", "Está"],
  ["op??o", "opção"],
  ["Op??o", "Opção"],
  ["A??o", "Ação"],
  ["A??es", "Ações"],
  ["a??es", "ações"]
]);

function applyDirectReplacements(value) {
  let result = String(value || "");
  for (const [source, target] of DIRECT_REPLACEMENTS.entries()) {
    result = result.split(source).join(target);
  }
  return result;
}

function needsRoundTrip(value) {
  return /[ÃÂâï]/.test(value);
}

export function repairMojibake(value) {
  if (typeof value !== "string" || !value) {
    return value;
  }

  let current = applyDirectReplacements(value).normalize("NFC");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!needsRoundTrip(current)) {
      break;
    }

    const repaired = Buffer.from(current, "latin1").toString("utf8");
    if (!repaired || repaired === current) {
      break;
    }

    current = applyDirectReplacements(repaired).normalize("NFC");
  }

  return applyDirectReplacements(current)
    .replace(/^\uFEFF/, "")
    .replace(/^\uFFFD+/, "")
    .replace(/Â\u00A0/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}
