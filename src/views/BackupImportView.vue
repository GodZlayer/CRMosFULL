<template>
  <AppShell
    title="Backup e importação"
    subtitle="Backup e restauração do CRM em um único arquivo ODS, sem depender de MySQL ou links externos.">
    <div class="row g-4 mb-4">
      <div class="col-md-6 col-xl-4">
        <div class="panel-card h-100">
          <div class="small fw-semibold mb-2">Empresa</div>
          <div class="h5 fw-bold mb-1">{{ session.company?.shortName || "-" }}</div>
          <div>Login ativo da empresa</div>
        </div>
      </div>
      <div class="col-md-6 col-xl-4">
        <div class="panel-card h-100">
          <div class="small fw-semibold mb-2">Loja</div>
          <div class="h5 fw-bold mb-1">{{ session.store?.shortName || session.store?.name || "-" }}</div>
          <div>Contexto atual da operação</div>
        </div>
      </div>
      <div class="col-md-6 col-xl-4">
        <div class="panel-card h-100">
          <div class="small fw-semibold mb-2">Última ação</div>
          <div class="h5 fw-bold mb-1">{{ lastActionLabel }}</div>
          <div>Resumo operacional da tela</div>
        </div>
      </div>
    </div>

    <div class="backup-import__tabs mb-4">
      <button
        class="btn rounded-pill"
        :class="currentTab === 'operations' ? 'btn-primary' : 'btn-outline-secondary'"
        @click="currentTab = 'operations'">
        <i class="fa-solid fa-database me-2"></i>
        Backup e importação
      </button>
      <button
        class="btn rounded-pill"
        :class="currentTab === 'admin' ? 'btn-primary' : 'btn-outline-secondary'"
        @click="openAdminTab">
        <i class="fa-solid fa-sliders me-2"></i>
        Administração
      </button>
      <button
        class="btn rounded-pill"
        :class="currentTab === 'transfer' ? 'btn-primary' : 'btn-outline-secondary'"
        @click="openTransferTab">
        <i class="fa-solid fa-right-left me-2"></i>
        Transferência interna
      </button>
    </div>

    <div v-if="currentTab === 'operations'" class="row g-4">
      <div class="col-12 col-xl-6">
        <section class="panel-card h-100 d-grid gap-4">
          <div>
            <div class="small fw-semibold mb-2">Backup completo</div>
            <h2 class="h4 fw-bold mb-1">Exportar base inteira em ODS</h2>
            <p class="mb-0">
              Gera um arquivo `.ods` com todas as tabelas portáveis do CRM para servir como backup e restore no mesmo formato.
            </p>
          </div>

          <div class="panel-card bg-body-tertiary border-0">
            <div class="small fw-semibold mb-2">O que entra no arquivo</div>
            <ul class="mb-0 ps-3">
              <li>Tabelas de clientes, estoque, financeiro, OS, PDV, tarefas, auditoria e cadastros</li>
              <li>As tabelas transitórias de sessão ficam de fora</li>
              <li>O arquivo exportado é o mesmo que a importação entende</li>
            </ul>
          </div>

          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-outline-success rounded-pill" :disabled="busy.odsExport" @click="downloadOperationalOds">
              <i class="fa-solid fa-file-arrow-down me-2"></i>
              {{ busy.odsExport ? "Gerando backup..." : "Exportar backup ODS" }}
            </button>
          </div>
        </section>
      </div>

      <div class="col-12 col-xl-6">
        <section class="panel-card h-100 d-grid gap-4">
          <div>
            <div class="small fw-semibold mb-2">Restauração</div>
            <h2 class="h4 fw-bold mb-1">Importar e substituir a base</h2>
            <p class="mb-0">
              Selecione um backup `.ods` exportado por este mesmo sistema. A importação substitui os dados atuais.
            </p>
          </div>

          <div class="d-grid gap-3">
            <div>
              <label class="form-label fw-semibold">Arquivo ODS</label>
              <input class="form-control rounded-4" type="file" accept=".ods" @change="onBackupFileChange" />
              <div class="form-text">
                {{ backupFileName || "Nenhum arquivo selecionado." }}
              </div>
            </div>
            <div class="alert alert-warning border-0 mb-0">
              Importar um backup substitui a base atual. Use apenas arquivos gerados por esta nova lógica.
            </div>
          </div>

          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-primary rounded-pill" :disabled="busy.odsImport || !backupFile" @click="runBackupImport">
              <i class="fa-solid fa-database me-2"></i>
              {{ busy.odsImport ? "Importando backup..." : "Importar e substituir" }}
            </button>
            <button class="btn btn-outline-secondary rounded-pill" :disabled="busy.odsImport && !backupFile" @click="clearBackupFile">
              Limpar arquivo
            </button>
          </div>
        </section>
      </div>
    </div>

    <div v-else class="d-grid gap-4">
      <section v-if="currentTab === 'transfer'" class="panel-card d-grid gap-4">
        <div class="d-flex flex-wrap justify-content-between gap-3 align-items-start">
          <div>
            <div class="small fw-semibold mb-2">Movimentação interna</div>
            <h2 class="h4 fw-bold mb-1">Transferir saldo entre contas</h2>
            <p class="mb-0">
              Use esta aba para mover dinheiro entre contas da loja sem criar receita ou despesa.
            </p>
          </div>
          <div class="backup-import__summary-card">
            <span>Contas ativas</span>
            <strong>{{ cashAccounts.filter((item) => Number(item.active) === 1).length }}</strong>
          </div>
        </div>

        <div class="row g-4">
          <div class="col-12 col-xl-6">
            <form class="row g-3" @submit.prevent="submitTransferForm">
              <div class="col-md-6">
                <label class="form-label fw-semibold">Conta de origem</label>
                <select v-model.number="transferForm.fromCashAccountId" class="form-select rounded-4" required>
                  <option :value="0">Selecione</option>
                  <option v-for="item in activeCashAccounts" :key="item.id" :value="item.id">
                    {{ item.name }} | {{ formatMoney(item.balance_amount) }}
                  </option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">Conta de destino</label>
                <select v-model.number="transferForm.toCashAccountId" class="form-select rounded-4" required>
                  <option :value="0">Selecione</option>
                  <option v-for="item in activeCashAccounts" :key="item.id" :value="item.id">
                    {{ item.name }} | {{ formatMoney(item.balance_amount) }}
                  </option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">Valor</label>
                <input v-model="transferForm.amount" type="text" inputmode="decimal" class="form-control rounded-4" placeholder="-573,10" />
                <div class="form-text">Use valor negativo para transferir uma dívida; a origem melhora e o destino assume o saldo negativo.</div>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">Data</label>
                <input v-model="transferForm.movementDate" type="date" class="form-control rounded-4" />
              </div>
              <div class="col-12">
                <label class="form-label fw-semibold">Observação</label>
                <textarea v-model="transferForm.notes" rows="3" class="form-control rounded-4" placeholder="Opcional: motivo, referencia interna, ajuste de saldo..."></textarea>
              </div>
              <div class="col-12 d-flex flex-wrap gap-2">
                <button class="btn btn-primary rounded-pill" :disabled="busy.transferSave">
                  <i class="fa-solid fa-right-left me-2"></i>
                  {{ busy.transferSave ? "Transferindo..." : "Transferir saldo" }}
                </button>
                <button type="button" class="btn btn-outline-secondary rounded-pill" @click="resetTransferForm">
                  Limpar
                </button>
              </div>
            </form>
          </div>

          <div class="col-12 col-xl-6">
            <section class="panel-card h-100 d-grid gap-3">
              <div>
                <div class="small fw-semibold mb-2">Contas da loja</div>
                <h3 class="h5 fw-bold mb-1">Saldos disponíveis</h3>
                <p class="mb-0">Selecione as contas abaixo para movimentar saldo entre elas.</p>
              </div>
              <div class="table-responsive">
                <table class="table table-dark table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Conta</th>
                      <th>Status</th>
                      <th class="text-end">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in cashAccounts" :key="item.id">
                      <td>{{ item.code }}</td>
                      <td>{{ item.name }}</td>
                      <td>{{ Number(item.active || 0) === 1 ? "Ativa" : "Inativa" }}</td>
                      <td class="text-end">{{ formatMoney(item.balance_amount) }}</td>
                    </tr>
                    <tr v-if="!cashAccounts.length">
                      <td colspan="4" class="text-center py-4">Nenhuma conta cadastrada.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="small">
                A transferência interna só move saldo entre contas da loja. Uma conta de origem negativa não bloqueia a operação. Ela não entra como receita nem como despesa.
              </div>
            </section>
          </div>
        </div>
      </section>

      <section class="panel-card d-grid gap-3">
        <div class="d-flex flex-wrap justify-content-between gap-3 align-items-start">
          <div>
            <div class="small fw-semibold mb-2">Administração manual</div>
            <h2 class="h4 fw-bold mb-1">Cadastros da loja</h2>
            <p class="mb-0">
              Gerencie usuários, contas de caixa, categorias financeiras e regras de automação manualmente.
            </p>
          </div>
          <button class="btn btn-outline-secondary rounded-pill" :disabled="busy.adminLoad" @click="loadAdminData(true)">
            <i class="fa-solid fa-rotate me-2"></i>
            {{ busy.adminLoad ? "Atualizando..." : "Atualizar dados" }}
          </button>
        </div>

        <div class="backup-import__summary-grid">
          <div class="backup-import__summary-card">
            <span>Usuários</span>
            <strong>{{ adminUsers.length }}</strong>
          </div>
          <div class="backup-import__summary-card">
            <span>Contas de caixa</span>
            <strong>{{ cashAccounts.length }}</strong>
          </div>
          <div class="backup-import__summary-card">
            <span>Categorias</span>
            <strong>{{ financeCategories.length }}</strong>
          </div>
          <div class="backup-import__summary-card">
            <span>Regras</span>
            <strong>{{ automationRules.length }}</strong>
          </div>
        </div>
      </section>

      <div class="row g-4">
        <div class="col-12 col-xxl-6">
          <section class="panel-card h-100 d-grid gap-4">
            <div class="d-flex flex-wrap justify-content-between gap-3 align-items-start">
              <div>
                <div class="small fw-semibold mb-2">Usuários da loja</div>
                <h3 class="h5 fw-bold mb-1">Perfis manuais</h3>
                <p class="mb-0">Cadastre quem poderá selecionar perfil e operar o CRM.</p>
              </div>
              <button class="btn btn-outline-secondary rounded-pill" @click="resetUserForm">
                <i class="fa-solid fa-plus me-2"></i>
                Novo usuário
              </button>
            </div>

            <div class="table-responsive">
              <table class="table table-dark table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>Papel</th>
                    <th class="text-end">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in adminUsers" :key="item.id">
                    <td>{{ item.name }}</td>
                    <td>{{ item.email }}</td>
                    <td>{{ item.role }}</td>
                    <td class="text-end">
                      <div class="d-inline-flex gap-2">
                        <button class="btn btn-sm btn-outline-light rounded-pill" @click="editUser(item)">Editar</button>
                        <button class="btn btn-sm btn-outline-danger rounded-pill" @click="removeUser(item)">Remover</button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="!adminUsers.length">
                    <td colspan="4" class="text-center py-4">Nenhum usuário cadastrado.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <form class="row g-3" @submit.prevent="submitUserForm">
              <div class="col-md-6">
                <label class="form-label fw-semibold">Nome</label>
                <input v-model="userForm.name" class="form-control rounded-4" required />
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">Email</label>
                <input v-model="userForm.email" type="email" class="form-control rounded-4" required />
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">Papel</label>
                <input v-model="userForm.role" class="form-control rounded-4" placeholder="CONTA" />
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">Senha {{ userForm.id ? "(opcional para manter)" : "" }}</label>
                <input v-model="userForm.password" type="password" class="form-control rounded-4" :required="!userForm.id" />
              </div>
              <div class="col-12 d-flex flex-wrap gap-2">
                <button class="btn btn-primary rounded-pill" :disabled="busy.userSave">
                  <i class="fa-solid fa-floppy-disk me-2"></i>
                  {{ busy.userSave ? "Salvando..." : userForm.id ? "Salvar usuário" : "Criar usuário" }}
                </button>
                <button type="button" class="btn btn-outline-secondary rounded-pill" @click="resetUserForm">Limpar</button>
              </div>
            </form>
          </section>
        </div>

        <div class="col-12 col-xxl-6">
          <section class="panel-card h-100 d-grid gap-4">
            <div class="d-flex flex-wrap justify-content-between gap-3 align-items-start">
              <div>
                <div class="small fw-semibold mb-2">Contas de caixa</div>
                <h3 class="h5 fw-bold mb-1">Saldos e cadastros</h3>
                <p class="mb-0">Adicione, edite ou remova contas usadas pelo financeiro e PDV.</p>
              </div>
              <button class="btn btn-outline-secondary rounded-pill" @click="resetCashAccountForm">
                <i class="fa-solid fa-plus me-2"></i>
                Nova conta
              </button>
            </div>

            <div class="table-responsive">
              <table class="table table-dark table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nome</th>
                    <th class="text-end">Saldo inicial</th>
                    <th>Status</th>
                    <th class="text-end">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in cashAccounts" :key="item.id">
                    <td>{{ item.code }}</td>
                    <td>{{ item.name }}</td>
                    <td class="text-end">{{ formatMoney(item.baseline_amount) }}</td>
                    <td>{{ item.active ? "Ativa" : "Inativa" }}</td>
                    <td class="text-end">
                      <div class="d-inline-flex gap-2">
                        <button class="btn btn-sm btn-outline-light rounded-pill" @click="editCashAccount(item)">Editar</button>
                        <button class="btn btn-sm btn-outline-danger rounded-pill" @click="removeCashAccount(item)">
                          {{ Number(item.movement_count || 0) > 0 ? "Arquivar" : "Remover" }}
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="!cashAccounts.length">
                    <td colspan="5" class="text-center py-4">Nenhuma conta cadastrada.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <form class="row g-3" @submit.prevent="submitCashAccountForm">
              <div class="col-md-4">
                <label class="form-label fw-semibold">Código</label>
                <input v-model="cashAccountForm.code" class="form-control rounded-4" required />
              </div>
              <div class="col-md-8">
                <label class="form-label fw-semibold">Nome</label>
                <input v-model="cashAccountForm.name" class="form-control rounded-4" required />
              </div>
              <div class="col-md-8">
                <label class="form-label fw-semibold">Saldo inicial</label>
                <input v-model.number="cashAccountForm.baseline_amount" type="number" step="0.01" class="form-control rounded-4" />
                <div class="form-text">Esse valor passa a ser o saldo atual da conta.</div>
              </div>
              <div class="col-md-4 d-flex align-items-end">
                <div class="form-check form-switch mb-2">
                  <input id="cash-account-active" v-model="cashAccountForm.active" class="form-check-input" type="checkbox" />
                  <label class="form-check-label" for="cash-account-active">Conta ativa</label>
                </div>
              </div>
              <div class="col-12 d-flex flex-wrap gap-2">
                <button class="btn btn-primary rounded-pill" :disabled="busy.cashSave">
                  <i class="fa-solid fa-floppy-disk me-2"></i>
                  {{ busy.cashSave ? "Salvando..." : cashAccountForm.id ? "Salvar conta" : "Criar conta" }}
                </button>
                <button type="button" class="btn btn-outline-secondary rounded-pill" @click="resetCashAccountForm">Limpar</button>
              </div>
            </form>
          </section>
        </div>

        <div class="col-12 col-xxl-6">
          <section class="panel-card h-100 d-grid gap-4">
            <div class="d-flex flex-wrap justify-content-between gap-3 align-items-start">
              <div>
                <div class="small fw-semibold mb-2">Categorias financeiras</div>
                <h3 class="h5 fw-bold mb-1">Receitas e despesas</h3>
                <p class="mb-0">Controle manual das categorias usadas nos lançamentos financeiros.</p>
              </div>
              <button class="btn btn-outline-secondary rounded-pill" @click="resetFinanceCategoryForm">
                <i class="fa-solid fa-plus me-2"></i>
                Nova categoria
              </button>
            </div>

            <div class="table-responsive">
              <table class="table table-dark table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Status</th>
                    <th class="text-end">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in financeCategories" :key="item.id">
                    <td>{{ item.name }}</td>
                    <td>{{ item.entry_type }}</td>
                    <td>{{ item.active ? "Ativa" : "Inativa" }}</td>
                    <td class="text-end">
                      <div class="d-inline-flex gap-2">
                        <button class="btn btn-sm btn-outline-light rounded-pill" @click="editFinanceCategory(item)">Editar</button>
                        <button class="btn btn-sm btn-outline-danger rounded-pill" @click="removeFinanceCategory(item)">Remover</button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="!financeCategories.length">
                    <td colspan="4" class="text-center py-4">Nenhuma categoria cadastrada.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <form class="row g-3" @submit.prevent="submitFinanceCategoryForm">
              <div class="col-md-7">
                <label class="form-label fw-semibold">Nome</label>
                <input v-model="financeCategoryForm.name" class="form-control rounded-4" required />
              </div>
              <div class="col-md-5">
                <label class="form-label fw-semibold">Tipo</label>
                <select v-model="financeCategoryForm.entry_type" class="form-select rounded-4">
                  <option value="RECEITA">Receita</option>
                  <option value="DESPESA">Despesa</option>
                </select>
              </div>
              <div class="col-12">
                <div class="form-check form-switch">
                  <input id="finance-category-active" v-model="financeCategoryForm.active" class="form-check-input" type="checkbox" />
                  <label class="form-check-label" for="finance-category-active">Categoria ativa</label>
                </div>
              </div>
              <div class="col-12 d-flex flex-wrap gap-2">
                <button class="btn btn-primary rounded-pill" :disabled="busy.categorySave">
                  <i class="fa-solid fa-floppy-disk me-2"></i>
                  {{ busy.categorySave ? "Salvando..." : financeCategoryForm.id ? "Salvar categoria" : "Criar categoria" }}
                </button>
                <button type="button" class="btn btn-outline-secondary rounded-pill" @click="resetFinanceCategoryForm">Limpar</button>
              </div>
            </form>
          </section>
        </div>

        <div class="col-12 col-xxl-6">
          <section class="panel-card h-100 d-grid gap-4">
            <div class="d-flex flex-wrap justify-content-between gap-3 align-items-start">
              <div>
                <div class="small fw-semibold mb-2">Regras de automação</div>
                <h3 class="h5 fw-bold mb-1">Configuração simplificada</h3>
                <p class="mb-0">Use a estrutura atual como base e ajuste só o que realmente importa na operação.</p>
              </div>
              <button class="btn btn-outline-secondary rounded-pill" @click="resetAutomationRuleForm">
                <i class="fa-solid fa-plus me-2"></i>
                Nova regra
              </button>
            </div>

            <div class="table-responsive">
              <table class="table table-dark table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nome</th>
                    <th>Status</th>
                    <th class="text-end">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in automationRules" :key="item.id">
                    <td>{{ item.code }}</td>
                    <td>{{ item.name }}</td>
                    <td>{{ item.active ? "Ativa" : "Inativa" }}</td>
                    <td class="text-end">
                      <div class="d-inline-flex gap-2">
                        <button class="btn btn-sm btn-outline-light rounded-pill" @click="editAutomationRule(item)">Editar</button>
                        <button class="btn btn-sm btn-outline-danger rounded-pill" @click="removeAutomationRule(item)">Remover</button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="!automationRules.length">
                    <td colspan="4" class="text-center py-4">Nenhuma regra cadastrada.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <form class="row g-3" @submit.prevent="submitAutomationRuleForm">
              <div class="col-md-5">
                <label class="form-label fw-semibold">Código</label>
                <input v-model="automationRuleForm.code" class="form-control rounded-4" required />
              </div>
              <div class="col-md-7">
                <label class="form-label fw-semibold">Nome</label>
                <input v-model="automationRuleForm.name" class="form-control rounded-4" required />
              </div>
              <div class="col-12">
                <label class="form-label fw-semibold">Descrição</label>
                <input v-model="automationRuleForm.description" class="form-control rounded-4" />
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">Tipo base</label>
                <input
                  v-model="automationRuleForm.rule_type"
                  class="form-control rounded-4"
                  placeholder="LOW_STOCK"
                />
                <div class="form-text">Código interno do tipo de automação. Você pode criar outros além do padrão.</div>
              </div>
              <div class="col-md-6 d-flex align-items-end">
                <div class="form-check form-switch mb-2">
                  <input id="automation-rule-exclude-used" v-model="automationRuleForm.exclude_used" class="form-check-input" type="checkbox" />
                  <label class="form-check-label" for="automation-rule-exclude-used">Ignorar itens usados</label>
                </div>
              </div>
              <div class="col-12">
                <div class="form-text">A configuração avançada continua sendo salva no formato atual, mas sem exigir JSON manual.</div>
              </div>
              <div class="col-12">
                <div class="form-check form-switch">
                  <input id="automation-rule-active" v-model="automationRuleForm.active" class="form-check-input" type="checkbox" />
                  <label class="form-check-label" for="automation-rule-active">Regra ativa</label>
                </div>
              </div>
              <div class="col-12 d-flex flex-wrap gap-2">
                <button class="btn btn-primary rounded-pill" :disabled="busy.ruleSave">
                  <i class="fa-solid fa-floppy-disk me-2"></i>
                  {{ busy.ruleSave ? "Salvando..." : automationRuleForm.id ? "Salvar regra" : "Criar regra" }}
                </button>
                <button type="button" class="btn btn-outline-secondary rounded-pill" @click="resetAutomationRuleForm">Limpar</button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>

    <div class="row g-4 mt-0" v-if="lastResult">
      <div class="col-12">
        <section class="panel-card d-grid gap-4">
          <div class="d-flex flex-wrap justify-content-between gap-3 align-items-start">
            <div>
              <div class="small fw-semibold mb-2">Resultado</div>
              <h2 class="h4 fw-bold mb-1">{{ lastActionLabel }}</h2>
              <p class="mb-0">Resumo da última operação concluída nesta tela.</p>
            </div>
            <button class="btn btn-outline-secondary rounded-pill" @click="lastResult = null">
              <i class="fa-solid fa-xmark me-2"></i>
              Limpar resumo
            </button>
          </div>

          <div v-if="summaryChips.length" class="d-flex flex-wrap gap-2">
            <span v-for="chip in summaryChips" :key="chip.label" class="badge rounded-pill text-bg-secondary px-3 py-2">
              {{ chip.label }}: {{ chip.value }}
            </span>
          </div>

          <div v-if="tableRows.length" class="table-responsive">
            <table class="table table-dark table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Tabela / arquivo</th>
                  <th class="text-end">Linhas</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in tableRows" :key="row.label">
                  <td>{{ row.label }}</td>
                  <td class="text-end">{{ row.rows }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <pre class="backup-import__json">{{ prettyJson(lastResult) }}</pre>
        </section>
      </div>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import { api } from "../services/api";
import type { AdminUser, AutomationRule, FinanceCategory, StoreCashAccount } from "../services/types";
import { notifyError, notifySuccess } from "../services/ui";
import { useSessionStore } from "../stores/session";

const session = useSessionStore();
const currentTab = ref<"operations" | "admin" | "transfer">("operations");
const adminLoaded = ref(false);
const backupFile = ref<File | null>(null);

const mysqlForm = reactive({
  host: "168.232.199.161",
  port: 3306,
  user: "dnle_CRMADMIN",
  password: "",
  database: "dnle_CRM",
  replaceExisting: true,
  clearExisting: true
});

const odsForm = reactive({
  servicesUrl: "",
  cashUrl: ""
});

const busy = reactive({
  mysqlBackup: false,
  mysqlDump: false,
  mysqlImport: false,
  odsImport: false,
  odsExport: false,
  adminLoad: false,
  userSave: false,
  cashSave: false,
  categorySave: false,
  ruleSave: false,
  transferSave: false
});

const adminUsers = ref<AdminUser[]>([]);
const cashAccounts = ref<StoreCashAccount[]>([]);
const financeCategories = ref<FinanceCategory[]>([]);
const automationRules = ref<AutomationRule[]>([]);

const userForm = reactive({
  id: null as number | null,
  name: "",
  email: "",
  role: "CONTA",
  password: ""
});

const cashAccountForm = reactive({
  id: null as number | null,
  code: "",
  name: "",
  baseline_amount: 0,
  active: true
});

const financeCategoryForm = reactive({
  id: null as number | null,
  entry_type: "RECEITA",
  name: "",
  active: true
});

const automationRuleForm = reactive({
  id: null as number | null,
  code: "",
  name: "",
  description: "",
  active: true,
  rule_type: "LOW_STOCK",
  exclude_used: true
});

const transferForm = reactive({
  fromCashAccountId: 0,
  toCashAccountId: 0,
  amount: 0,
  movementDate: getTodayString(),
  notes: ""
});

const lastAction = ref("");
const lastResult = ref<any | null>(null);
const activeCashAccounts = computed(() => cashAccounts.value.filter((item) => Number(item.active || 0) === 1));

const lastActionLabel = computed(() => lastAction.value || "Nenhuma operação executada");

const backupFileName = computed(() => backupFile.value?.name || "");

const summaryChips = computed(() => {
  const payload = lastResult.value || {};
  const chips: Array<{ label: string; value: string | number }> = [];
  if (payload.fileName) {
    chips.push({ label: "Arquivo", value: payload.fileName });
  }
  if (payload.databaseName) {
    chips.push({ label: "Banco", value: payload.databaseName });
  }
  if (payload.totalRows !== undefined) {
    chips.push({ label: "Linhas", value: payload.totalRows });
  }
  if (payload.importedAt) {
    chips.push({ label: "Importado em", value: payload.importedAt.slice(0, 19).replace("T", " ") });
  }
  if (payload.exportedAt) {
    chips.push({ label: "Exportado em", value: payload.exportedAt.slice(0, 19).replace("T", " ") });
  }
  if (payload.importedAt && payload.store?.shortName) {
    chips.push({ label: "Loja", value: payload.store.shortName });
  }
  return chips;
});

const tableRows = computed(() => {
  const payload = lastResult.value || {};
  if (Array.isArray(payload.tables)) {
    return payload.tables.map((item: any) => ({ label: item.table, rows: item.rows }));
  }
  if (Array.isArray(payload.importedTables)) {
    return payload.importedTables.map((item: any) => ({ label: item.table, rows: item.rows }));
  }
  if (Array.isArray(payload.files)) {
    return payload.files.map((item: any) => ({
      label: item.workbook || item.fileName || "Arquivo",
      rows: item.tasksCreated ?? item.financeImported ?? item.stockImported ?? item.historyRowsPreserved ?? 0
    }));
  }
  if (Array.isArray(payload.sources)) {
    return payload.sources.map((item: any) => ({ label: item.fileName, rows: item.size }));
  }
  return [];
});

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));
}

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

function parseTransferAmount(value: unknown) {
  if (typeof value === "number") {
    return value;
  }
  const text = String(value ?? "").trim();
  if (!text) {
    return Number.NaN;
  }
  if (text.includes(",")) {
    return Number(text.replace(/\./g, "").replace(",", "."));
  }
  return Number(text);
}

function resetUserForm() {
  userForm.id = null;
  userForm.name = "";
  userForm.email = "";
  userForm.role = "CONTA";
  userForm.password = "";
}

function editUser(item: AdminUser) {
  userForm.id = item.id;
  userForm.name = item.name;
  userForm.email = item.email;
  userForm.role = item.role || "CONTA";
  userForm.password = "";
}

function resetCashAccountForm() {
  cashAccountForm.id = null;
  cashAccountForm.code = "";
  cashAccountForm.name = "";
  cashAccountForm.baseline_amount = 0;
  cashAccountForm.active = true;
}

function editCashAccount(item: StoreCashAccount) {
  cashAccountForm.id = item.id;
  cashAccountForm.code = item.code;
  cashAccountForm.name = item.name;
  cashAccountForm.baseline_amount = Number(item.baseline_amount || item.balance_amount || 0);
  cashAccountForm.active = Number(item.active || 0) === 1;
}

function resetFinanceCategoryForm() {
  financeCategoryForm.id = null;
  financeCategoryForm.entry_type = "RECEITA";
  financeCategoryForm.name = "";
  financeCategoryForm.active = true;
}

function editFinanceCategory(item: FinanceCategory) {
  financeCategoryForm.id = item.id;
  financeCategoryForm.entry_type = item.entry_type;
  financeCategoryForm.name = item.name;
  financeCategoryForm.active = Number(item.active || 0) === 1;
}

function resetAutomationRuleForm() {
  automationRuleForm.id = null;
  automationRuleForm.code = "";
  automationRuleForm.name = "";
  automationRuleForm.description = "";
  automationRuleForm.active = true;
  automationRuleForm.rule_type = "LOW_STOCK";
  automationRuleForm.exclude_used = true;
}

function resetTransferForm() {
  transferForm.amount = 0;
  transferForm.movementDate = getTodayString();
  transferForm.notes = "";
  transferForm.fromCashAccountId = Number(activeCashAccounts.value[0]?.id || 0);
  transferForm.toCashAccountId = Number(activeCashAccounts.value[1]?.id || activeCashAccounts.value[0]?.id || 0);
}

function editAutomationRule(item: AutomationRule) {
  automationRuleForm.id = item.id;
  automationRuleForm.code = item.code;
  automationRuleForm.name = item.name;
  automationRuleForm.description = item.description || "";
  automationRuleForm.active = Number(item.active || 0) === 1;
  try {
    const parsed = item.config_json ? JSON.parse(item.config_json) : {};
    automationRuleForm.rule_type = String(parsed.ruleType || "LOW_STOCK").trim() || "LOW_STOCK";
    automationRuleForm.exclude_used = !Array.isArray(parsed.excludeConditions) || parsed.excludeConditions.includes("USADA");
  } catch {
    automationRuleForm.rule_type = "LOW_STOCK";
    automationRuleForm.exclude_used = true;
  }
}

async function openAdminTab() {
  currentTab.value = "admin";
  if (!adminLoaded.value) {
    await loadAdminData();
  }
}

async function openTransferTab() {
  currentTab.value = "transfer";
  if (!adminLoaded.value) {
    await loadAdminData();
  }
  resetTransferForm();
}

async function loadAdminData(force = false) {
  if (busy.adminLoad) {
    return;
  }
  if (adminLoaded.value && !force) {
    return;
  }

  busy.adminLoad = true;
  try {
    const [usersResponse, cashResponse, categoriesResponse, rulesResponse] = await Promise.all([
      api.adminUsers(),
      api.storeCashAccounts(),
      api.financeCategories(),
      api.automationRules()
    ]);
    adminUsers.value = usersResponse.data;
    cashAccounts.value = cashResponse.data;
    financeCategories.value = categoriesResponse.data;
    automationRules.value = rulesResponse.data;
    adminLoaded.value = true;
  } catch (error) {
    await notifyError(error);
  } finally {
    busy.adminLoad = false;
  }
}

async function submitTransferForm() {
  busy.transferSave = true;
  try {
    if (!Number(transferForm.fromCashAccountId || 0)) {
      throw new Error("Selecione a conta de origem.");
    }
    if (!Number(transferForm.toCashAccountId || 0)) {
      throw new Error("Selecione a conta de destino.");
    }
    if (Number(transferForm.fromCashAccountId) === Number(transferForm.toCashAccountId)) {
      throw new Error("A conta de origem precisa ser diferente da conta de destino.");
    }
    const amount = parseTransferAmount(transferForm.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      throw new Error("Informe um valor diferente de zero para transferir.");
    }

    const response = await api.transferStoreCash({
      fromCashAccountId: Number(transferForm.fromCashAccountId),
      toCashAccountId: Number(transferForm.toCashAccountId),
      amount,
      movementDate: transferForm.movementDate || getTodayString(),
      notes: transferForm.notes.trim()
    });
    lastAction.value = "Transferência interna realizada";
    lastResult.value = response.data;
    resetTransferForm();
    await loadAdminData(true);
    await notifySuccess("Transferência registrada", "Saldo movido entre contas internas.");
  } catch (error) {
    await notifyError(error);
  } finally {
    busy.transferSave = false;
  }
}

function mysqlPayload() {
  return {
    host: mysqlForm.host,
    port: mysqlForm.port,
    user: mysqlForm.user,
    password: mysqlForm.password,
    database: mysqlForm.database
  };
}

async function runMysqlBackup() {
  busy.mysqlBackup = true;
  try {
    const response = await api.backupToMysql({
      ...mysqlPayload(),
      replaceExisting: mysqlForm.replaceExisting
    });
    lastAction.value = "Backup enviado ao MySQL";
    lastResult.value = response.data;
    await notifySuccess("Backup concluído", `${response.data.totalRows} linha(s) enviadas para ${response.data.databaseName}.`);
  } catch (error) {
    await notifyError(error);
  } finally {
    busy.mysqlBackup = false;
  }
}

async function downloadMysqlDump() {
  busy.mysqlDump = true;
  try {
    const { blob, fileName } = await api.downloadMysqlDump({
      databaseName: mysqlForm.database || "crm_backup"
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.URL.revokeObjectURL(url);
    lastAction.value = "Dump MySQL gerado";
    lastResult.value = { fileName, databaseName: mysqlForm.database || "crm_backup" };
    await notifySuccess("Dump gerado", fileName);
  } catch (error) {
    await notifyError(error);
  } finally {
    busy.mysqlDump = false;
  }
}

async function runMysqlImport() {
  busy.mysqlImport = true;
  try {
    const response = await api.importFromMysql({
      ...mysqlPayload(),
      clearExisting: mysqlForm.clearExisting
    });
    lastAction.value = "Importação vinda do MySQL";
    lastResult.value = response.data;
    await session.refreshMeta();
    await notifySuccess("Importação concluída", `${response.data.totalRows} linha(s) importadas de ${response.data.databaseName}.`);
  } catch (error) {
    await notifyError(error);
  } finally {
    busy.mysqlImport = false;
  }
}

async function runGoogleLinksImport() {
  busy.odsImport = true;
  try {
    const sources = [
      odsForm.servicesUrl ? { url: odsForm.servicesUrl, name: "Serviços 2026.ods", kind: "servicos" } : null,
      odsForm.cashUrl ? { url: odsForm.cashUrl, name: "26 CX Loja ok em 29 02.ods", kind: "caixa" } : null
    ].filter(Boolean);

    const response = await api.importFromGoogleLinks({ sources });
    lastAction.value = "Importação ODS por link";
    lastResult.value = response.data;
    await notifySuccess("Importação concluída", `${response.data.files.length} arquivo(s) processados para a loja atual.`);
  } catch (error) {
    await notifyError(error);
  } finally {
    busy.odsImport = false;
  }
}

async function downloadOperationalOds() {
  busy.odsExport = true;
  try {
    const { blob, fileName } = await api.downloadOperationalOds({});
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.URL.revokeObjectURL(url);
    lastAction.value = "Backup ODS gerado";
    lastResult.value = { fileName, exportedAt: new Date().toISOString() };
    await notifySuccess("Backup exportado", fileName);
  } catch (error) {
    await notifyError(error);
  } finally {
    busy.odsExport = false;
  }
}

function clearBackupFile() {
  backupFile.value = null;
}

async function onBackupFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0] || null;
  backupFile.value = file;
}

async function fileToBase64(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

async function runBackupImport() {
  if (!backupFile.value) {
    await notifyError(new Error("Selecione um arquivo ODS para importar."));
    return;
  }

  busy.odsImport = true;
  try {
    const contentBase64 = await fileToBase64(backupFile.value);
    const response = await api.importOperationalOds({
      fileName: backupFile.value.name,
      contentBase64,
      clearExisting: true
    });
    lastAction.value = "Backup ODS importado";
    lastResult.value = response.data;
    await session.refreshMeta();
    await notifySuccess("Backup importado", `Arquivo ${backupFile.value.name} aplicado com sucesso.`);
  } catch (error) {
    await notifyError(error);
  } finally {
    busy.odsImport = false;
  }
}

async function submitUserForm() {
  busy.userSave = true;
  try {
    const response = await api.saveAdminUser({ ...userForm });
    lastAction.value = userForm.id ? "Usuário atualizado" : "Usuário criado";
    lastResult.value = response.data;
    resetUserForm();
    await loadAdminData(true);
    await session.refreshMeta();
    await notifySuccess("Usuário salvo", response.data.name);
  } catch (error) {
    await notifyError(error);
  } finally {
    busy.userSave = false;
  }
}

async function removeUser(item: AdminUser) {
  if (!window.confirm(`Remover o usuário ${item.name}?`)) {
    return;
  }

  try {
    await api.deleteAdminUser(item.id);
    lastAction.value = "Usuário removido";
    lastResult.value = { id: item.id, email: item.email, success: true };
    await loadAdminData(true);
    await session.refreshMeta();
    await notifySuccess("Usuário removido", item.name);
    if (userForm.id === item.id) {
      resetUserForm();
    }
  } catch (error) {
    await notifyError(error);
  }
}

async function submitCashAccountForm() {
  busy.cashSave = true;
  try {
    const response = await api.saveStoreCashAccount({
      ...cashAccountForm,
      balance_amount: cashAccountForm.baseline_amount,
      active: cashAccountForm.active ? 1 : 0
    });
    lastAction.value = cashAccountForm.id ? "Conta de caixa atualizada" : "Conta de caixa criada";
    lastResult.value = response.data;
    resetCashAccountForm();
    await loadAdminData(true);
    await session.refreshMeta();
    await notifySuccess("Conta salva", response.data.name);
  } catch (error) {
    await notifyError(error);
  } finally {
    busy.cashSave = false;
  }
}

async function removeCashAccount(item: StoreCashAccount) {
  const actionLabel = Number(item.movement_count || 0) > 0 ? "Arquivar" : "Remover";
  if (!window.confirm(`${actionLabel} a conta ${item.name}?`)) {
    return;
  }

  try {
    const response = await api.deleteStoreCashAccount(item.id);
    const archived = Boolean((response as any)?.archived);
    lastAction.value = archived ? "Conta de caixa arquivada" : "Conta de caixa removida";
    lastResult.value = { id: item.id, code: item.code, success: true };
    await loadAdminData(true);
    await session.refreshMeta();
    await notifySuccess(archived ? "Conta arquivada" : "Conta removida", item.name);
    if (cashAccountForm.id === item.id) {
      resetCashAccountForm();
    }
  } catch (error) {
    await notifyError(error);
  }
}

async function submitFinanceCategoryForm() {
  busy.categorySave = true;
  try {
    const response = await api.saveFinanceCategory({
      ...financeCategoryForm,
      active: financeCategoryForm.active ? 1 : 0
    });
    lastAction.value = financeCategoryForm.id ? "Categoria financeira atualizada" : "Categoria financeira criada";
    lastResult.value = response.data;
    resetFinanceCategoryForm();
    await loadAdminData(true);
    await notifySuccess("Categoria salva", response.data.name);
  } catch (error) {
    await notifyError(error);
  } finally {
    busy.categorySave = false;
  }
}

async function removeFinanceCategory(item: FinanceCategory) {
  if (!window.confirm(`Remover a categoria ${item.name}?`)) {
    return;
  }

  try {
    await api.deleteFinanceCategory(item.id);
    lastAction.value = "Categoria financeira removida";
    lastResult.value = { id: item.id, name: item.name, success: true };
    await loadAdminData(true);
    await notifySuccess("Categoria removida", item.name);
    if (financeCategoryForm.id === item.id) {
      resetFinanceCategoryForm();
    }
  } catch (error) {
    await notifyError(error);
  }
}

async function submitAutomationRuleForm() {
  busy.ruleSave = true;
  try {
    const config = {
      ruleType: String(automationRuleForm.rule_type || "LOW_STOCK").trim() || "LOW_STOCK",
      excludeConditions: automationRuleForm.exclude_used ? ["USADA"] : []
    };
    const response = await api.saveAutomationRule({
      id: automationRuleForm.id || undefined,
      code: automationRuleForm.code,
      name: automationRuleForm.name,
      description: automationRuleForm.description,
      active: automationRuleForm.active ? 1 : 0,
      config
    });
    lastAction.value = automationRuleForm.id ? "Regra de automação atualizada" : "Regra de automação criada";
    lastResult.value = response.data;
    resetAutomationRuleForm();
    await loadAdminData(true);
    await notifySuccess("Regra salva", response.data.name);
  } catch (error) {
    await notifyError(error);
  } finally {
    busy.ruleSave = false;
  }
}

async function removeAutomationRule(item: AutomationRule) {
  if (!window.confirm(`Remover a regra ${item.name}?`)) {
    return;
  }

  try {
    await api.deleteAutomationRule(item.id);
    lastAction.value = "Regra de automação removida";
    lastResult.value = { id: item.id, code: item.code, success: true };
    await loadAdminData(true);
    await notifySuccess("Regra removida", item.name);
    if (automationRuleForm.id === item.id) {
      resetAutomationRuleForm();
    }
  } catch (error) {
    await notifyError(error);
  }
}

onMounted(() => {
  void loadAdminData();
});
</script>

<style scoped>
.backup-import__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.backup-import__summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.9rem;
}

.backup-import__summary-card {
  padding: 1rem 1.1rem;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: grid;
  gap: 0.25rem;
}

.backup-import__summary-card span {
  color: rgba(214, 223, 236, 0.76);
  font-size: 0.84rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.backup-import__summary-card strong {
  font-size: 1.5rem;
  color: #f4f7fb;
}

.backup-import__json {
  margin: 0;
  padding: 1rem 1.25rem;
  border-radius: 1.25rem;
  background: rgba(7, 16, 30, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #d7e3ff;
  font-size: 0.875rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
