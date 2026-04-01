export const TIME_ZONE = "America/Sao_Paulo";

export const ROLES = [];

export const ORDER_STATUSES = [
  { code: "ABERTA", label: "Aberta", tone: "warning" },
  { code: "EM_ANDAMENTO", label: "Em andamento", tone: "info" },
  { code: "CONCLUIDA", label: "Concluída", tone: "success" },
  { code: "CANCELADA", label: "Cancelada", tone: "danger" }
];

export const APPROVAL_STATUSES = [
  { code: "PRE_APROVADA", label: "Pré-aprovada", tone: "info" },
  { code: "APROVADA", label: "Aprovada", tone: "success" },
  { code: "AGUARDANDO_APROVACAO", label: "Aguardando aprovação", tone: "warning" },
  { code: "REJEITADA", label: "Rejeitada", tone: "danger" }
];

export const PAYMENT_METHODS = [
  { code: "CC_PIX_PJ_MAQ_VERM", label: "C/C pix PJ e maq verm" },
  { code: "MAQ_AMARELA_PIX_CEL", label: "Maq Amarela/pix cel" },
  { code: "CAIXINHA_LOJA", label: "Caixinha loja" },
  { code: "R_COM_DENIO", label: "R$ com Denio" },
  { code: "OUTROS_REGINA", label: "outros Regina" },
  { code: "ARTHUR", label: "Arthur" },
  { code: "BOLETOS", label: "boletos" }
];

export const ITEM_CONDITIONS = [
  { code: "NOVA", label: "Nova" },
  { code: "SEMINOVA", label: "Seminova" },
  { code: "USADA", label: "Usada" }
];

export const ENTRY_TYPES = [
  { code: "RECEITA", label: "Receita" },
  { code: "DESPESA", label: "Despesa" }
];

export const TASK_STATUSES = [
  { code: "PENDENTE", label: "Pendente", tone: "secondary" },
  { code: "EM_ANDAMENTO", label: "Em andamento", tone: "primary" },
  { code: "AGUARDANDO", label: "Aguardando", tone: "warning" },
  { code: "CONCLUIDA", label: "Concluída", tone: "success" },
  { code: "CANCELADA", label: "Cancelada", tone: "danger" }
];

export const TASK_PRIORITIES = [
  { code: "BAIXA", label: "Baixa", tone: "secondary" },
  { code: "MEDIA", label: "Média", tone: "info" },
  { code: "ALTA", label: "Alta", tone: "warning" },
  { code: "URGENTE", label: "Urgente", tone: "danger" }
];

export const TASK_CONTACT_CHANNELS = [
  { code: "WHATSAPP", label: "WhatsApp" },
  { code: "LIGACAO", label: "Ligação" },
  { code: "INTERNO", label: "Interno" },
  { code: "OUTRO", label: "Outro" }
];

export const STORE_CASH_ACCOUNT_SEEDS = [
  { code: "CC_PIX_PJ_MAQ_VERM", name: "C/C pix PJ e maq verm" },
  { code: "MAQ_AMARELA_PIX_CEL", name: "Maq Amarela/pix cel" },
  { code: "CAIXINHA_LOJA", name: "Caixinha loja" },
  { code: "R_COM_DENIO", name: "R$ com Denio" },
  { code: "OUTROS_REGINA", name: "outros Regina" },
  { code: "BOLETOS", name: "boletos" },
  { code: "ARTHUR", name: "Arthur" }
];

export const FINANCE_CATEGORY_SEEDS = {
  RECEITA: [
    "Venda de produto",
    "Venda de serviço",
    "Visita técnica",
    "Recebimento de OS",
    "Outras receitas"
  ],
  DESPESA: [
    "Manutenção terceirizada",
    "Compra de produto",
    "Compra de serviço",
    "Frete",
    "Operacional",
    "Outras despesas"
  ]
};

export const CATALOG_CATEGORIES = [
  "Notebooks e Portáteis",
  "Computadores",
  "Monitores",
  "Gabinetes",
  "Placas-mãe",
  "Processadores",
  "Memória RAM",
  "Armazenamento",
  "Fontes",
  "Placas de vídeo",
  "Refrigeração",
  "Periféricos",
  "Redes e Wireless",
  "Cabos e Adaptadores",
  "Baterias e Carregadores",
  "Acessórios"
];

export const CATALOG_SUBCATEGORIES_MAP = {
  "Notebooks e Portáteis": [
    "Notebook",
    "Ultrabook",
    "MacBook",
    "Chromebook",
    "Workstation móvel"
  ],
  Computadores: [
    "PC completo",
    "Desktop",
    "All in One",
    "Mini PC",
    "Workstation"
  ],
  Monitores: [
    "Monitor LED",
    "Monitor Gamer",
    "Monitor Ultrawide",
    "Monitor Portátil"
  ],
  Gabinetes: [
    "Mid Tower",
    "Full Tower",
    "Mini Tower",
    "Open Frame"
  ],
  "Placas-mãe": [
    "AM4",
    "AM5",
    "LGA 1151",
    "LGA 1200",
    "LGA 1700",
    "LGA 1851"
  ],
  Processadores: [
    "AM3",
    "AM4",
    "AM5",
    "LGA 1151",
    "LGA 1200",
    "LGA 1700",
    "LGA 1851"
  ],
  "Memória RAM": [
    "DDR2",
    "DDR3",
    "DDR4",
    "DDR5",
    "SO-DIMM DDR3",
    "SO-DIMM DDR4",
    "SO-DIMM DDR5"
  ],
  Armazenamento: [
    "SSD SATA 2.5",
    "SSD NVMe M.2",
    "HD 2.5",
    "HD 3.5",
    "SSD externo",
    "HD externo"
  ],
  Fontes: [
    "ATX",
    "SFX",
    "Notebook"
  ],
  "Placas de vídeo": [
    "PCIe",
    "Low Profile",
    "Profissional"
  ],
  "Refrigeração": [
    "Cooler para processador",
    "Air Cooler",
    "Water Cooler",
    "Cooler para gabinete"
  ],
  "Periféricos": [
    "Teclado",
    "Mouse",
    "Headset",
    "Microfone",
    "Webcam",
    "Caixa de som",
    "Mousepad"
  ],
  "Redes e Wireless": [
    "Roteador",
    "Adaptador USB",
    "Placa PCIe",
    "Switch"
  ],
  "Cabos e Adaptadores": [
    "HDMI",
    "DisplayPort",
    "VGA/DVI",
    "Cabo de força",
    "Hub USB",
    "Adaptador de vídeo"
  ],
  "Baterias e Carregadores": [
    "Bateria notebook",
    "Carregador notebook",
    "Fonte externa"
  ],
  "Acessórios": [
    "Bolsa e capa",
    "Suporte",
    "Dock station",
    "Adaptador",
    "Kit de limpeza"
  ]
};

export const DEMO_USERS = [
  {
    name: "Denio",
    email: "admin@brasilexpress.local",
    password: "admin123",
    role: "CONTA"
  },
  {
    name: "Geovanne",
    email: "gerente@brasilexpress.local",
    password: "gerente123",
    role: "CONTA"
  },
  {
    name: "Sofia",
    email: "atendente@brasilexpress.local",
    password: "atendente123",
    role: "CONTA"
  },
  {
    name: "Arthur",
    email: "arthur@brasilexpress.local",
    password: "arthur123",
    role: "CONTA"
  },
  {
    name: "Daniel S.",
    email: "tecnico@brasilexpress.local",
    password: "tecnico123",
    role: "CONTA"
  }
];
