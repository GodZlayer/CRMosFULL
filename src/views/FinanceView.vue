<template>
  <AppShell title="Financeiro" subtitle="Caixa manual compartilhado por loja, com leitura por ciclo de abertura/fechamento e por mês.">
    <template #actions>
      <button
        v-if="!activeCashSession"
        class="btn btn-outline-primary rounded-pill"
        :disabled="loading"
        @click="openOpenCashModal">
        <i class="fa-solid fa-door-open me-2"></i>
        Abrir caixa
      </button>
      <button
        v-else
        class="btn btn-outline-warning rounded-pill"
        :disabled="loading"
        @click="openCloseCashModal">
        <i class="fa-solid fa-door-closed me-2"></i>
        Fechar caixa
      </button>
      <button class="btn btn-primary rounded-pill" :disabled="loading || !workbook" @click="openExpenseModal">
        <i class="fa-solid fa-arrow-up-right-dots me-2"></i>
        Lançar saída
      </button>
    </template>


    <section v-if="workbook" class="d-grid gap-4">
      <div class="row g-4">
        <div class="col-md-4">
          <MetricCard title="Saldo atual" :value="money(totalBalance)" hint="Soma das contas oficiais da loja neste momento." icon="fa-solid fa-wallet" tone="success" />
        </div>
        <div class="col-md-4">
          <MetricCard title="Caixa aberto agora" :value="activeCashSession ? 'Sim' : 'Não'" :hint="activeCashSession ? `Ciclo iniciado em ${dateLabel(activeCashSession.opened_at)}` : 'Nenhum ciclo aberto no momento.'" icon="fa-solid fa-cash-register" :tone="activeCashSession ? 'primary' : 'secondary'" />
        </div>
        <div class="col-md-4">
          <MetricCard title="Fluxo mensal" :value="money(monthlySummary.net)" :hint="`${monthMovementRows.length} movimentação(ões) em ${monthLabel}`" icon="fa-solid fa-calendar-days" :tone="monthlySummary.net < 0 ? 'warning' : 'info'" />
        </div>
      </div>
      <div class="row g-4">
        <div class="col-md-4">
          <MetricCard title="Saldo Outros" :value="money(othersBalance)" hint="Conta OUTROS para despesas gerais" icon="fa-solid fa-coins" tone="warning" />
        </div>
      </div>

      <div class="panel-card">
        <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
          <div>
            <div class="small fw-semibold">Conferência</div>
            <h3 class="h5 fw-bold mb-1">Saldo por tipo</h3>
            <p class="mb-0">Conta: máquina amarela + conta vermelha. Dinheiro: caixinha loja + R$ Denio. Outros: outros + boletos.</p>
          </div>
        </div>

        <div class="row g-3">
          <div v-for="row in groupedRows" :key="row.label" class="col-md-4">
            <div class="panel-card h-100 bg-light-subtle border border-secondary-subtle">
              <div class="small fw-semibold mb-2">{{ row.label }}</div>
              <div class="fs-4 fw-bold">{{ money(row.value) }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="panel-card">
        <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
          <div>
            <div class="small fw-semibold">Contas vivas</div>
            <h3 class="h5 fw-bold mb-1">Saldo por conta</h3>
            <p class="mb-0">Cada lançamento entra direto no saldo real da conta correspondente.</p>
          </div>
          <div class="be-badge text-bg-light border">
            <i class="fa-solid fa-building-columns"></i>
            {{ accounts.length }} conta(s)
          </div>
        </div>

        <div class="row g-3">
          <div v-for="account in accounts" :key="account.id" class="col-lg-4 col-md-6">
            <div class="panel-card h-100 bg-light-subtle border border-secondary-subtle">
              <div class="small fw-semibold mb-2">{{ account.code }}</div>
              <div class="fw-semibold mb-1">{{ account.name }}</div>
              <div class="fs-4 fw-bold">{{ money(account.balance_amount) }}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="panel-card d-grid gap-4">
        <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
          <div>
            <div class="small fw-semibold">Ciclo manual</div>
            <h3 class="h5 fw-bold mb-1">Abrir e fechar caixa</h3>
            <p class="mb-0">O caixa é o mesmo para todos os perfis da loja. O ciclo abre e fecha manualmente, sem troca automática de dia.</p>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            <span class="be-badge text-bg-light border">
              <i class="fa-solid fa-users me-2"></i>
              Compartilhado por loja
            </span>
            <span :class="`be-badge text-bg-${activeCashSession ? 'primary' : 'secondary'}`">
              <i class="fa-solid fa-circle-dot me-2"></i>
              {{ activeCashSession ? 'Caixa aberto' : 'Sem caixa aberto' }}
            </span>
          </div>
        </div>

        <div class="row g-3 align-items-end">
          <div class="col-lg-5">
            <label class="form-label fw-semibold">Ciclo para conferência</label>
            <select v-model.number="selectedCycleId" class="form-select rounded-4">
              <option :value="0">Caixa aberto agora ou último fechado</option>
              <option v-for="sessionItem in cashSessions" :key="sessionItem.id" :value="sessionItem.id">
                {{ cashSessionLabel(sessionItem) }}
              </option>
            </select>
          </div>
          <div class="col-lg-7 small">
            <div v-if="selectedCycle">Abertura {{ dateLabel(selectedCycle.opened_at) }}<span v-if="selectedCycle.closed_at"> | Fechamento {{ dateLabel(selectedCycle.closed_at) }}</span><span v-else> | Ainda aberto</span>.</div>
            <div v-else>Nenhum ciclo registrado ainda.</div>
          </div>
        </div>

        <div v-if="selectedCycle" class="row g-3">
          <div class="col-lg-2 col-md-4">
            <div class="panel-card h-100 bg-light-subtle border border-secondary-subtle">
              <div class="small fw-semibold mb-2">Status</div>
              <div class="fw-bold">{{ selectedCycle.status === 'OPEN' ? 'Aberto' : 'Fechado' }}</div>
            </div>
          </div>
          <div class="col-lg-2 col-md-4">
            <div class="panel-card h-100 bg-light-subtle border border-secondary-subtle">
              <div class="small fw-semibold mb-2">Abertura</div>
              <div class="fw-bold">{{ money(selectedCycle.opening_amount) }}</div>
            </div>
          </div>
          <div class="col-lg-2 col-md-4">
            <div class="panel-card h-100 bg-light-subtle border border-secondary-subtle">
              <div class="small fw-semibold mb-2">Entradas</div>
              <div class="fw-bold text-success">{{ money(cycleSummary.entries) }}</div>
            </div>
          </div>
          <div class="col-lg-2 col-md-4">
            <div class="panel-card h-100 bg-light-subtle border border-secondary-subtle">
              <div class="small fw-semibold mb-2">Saídas</div>
              <div class="fw-bold text-danger">{{ money(cycleSummary.expenses) }}</div>
            </div>
          </div>
          <div class="col-lg-2 col-md-4">
            <div class="panel-card h-100 bg-light-subtle border border-secondary-subtle">
              <div class="small fw-semibold mb-2">Líquido</div>
              <div class="fw-bold">{{ money(cycleSummary.net) }}</div>
            </div>
          </div>
          <div class="col-lg-2 col-md-4">
            <div class="panel-card h-100 bg-light-subtle border border-secondary-subtle">
              <div class="small fw-semibold mb-2">Fechamento</div>
              <div class="fw-bold">{{ money(cycleClosingAmount) }}</div>
              <div class="small">Esperado {{ money(cycleExpectedAmount) }}</div>
            </div>
          </div>
        </div>

        <div v-if="selectedCycle" class="small">
          Variação do ciclo: {{ money(cycleBalanceDelta) }}.
          <span v-if="selectedCycle.status === 'CLOSED'">Diferença entre fechado e esperado: {{ money(cycleClosingDifference) }}.</span>
        </div>

        <div v-if="selectedCycle && cycleMovementRows.length" class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Conta</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in cycleMovementRows.slice(0, 40)" :key="entry.id">
                <td>{{ dateLabel(entry.movement_date) }}</td>
                <td>{{ entry.description }}</td>
                <td>{{ movementAccountLabel(entry) }}</td>
                <td>
                  <span :class="`badge text-bg-${entryTone(entry)}`">
                    {{ entryLabel(entry) }}
                  </span>
                </td>
                <td>{{ money(entry.amount) }}</td>
                <td>
                  <button
                    v-if="canRevertMovement(entry)"
                    class="btn btn-sm btn-outline-danger rounded-pill"
                    :disabled="revertingMovementId === entry.id"
                    @click="revertMovement(entry)">
                    {{ revertingMovementId === entry.id ? "Desfazendo..." : "Reverter" }}
                  </button>
                  <button
                    v-if="canEditMovement(entry)"
                    class="btn btn-sm btn-outline-primary rounded-pill ms-2"
                    @click="openEditFinanceModal(entry)">
                    Editar
                  </button>
                  <span v-else-if="!canRevertMovement(entry)">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else-if="selectedCycle">Nenhuma movimentação encontrada dentro deste ciclo.</div>
        <div v-else>Abra o primeiro caixa manual para começar a acompanhar os ciclos.</div>
      </div>

      <div class="panel-card d-grid gap-4">
        <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
          <div>
            <div class="small fw-semibold">Fluxo mensal</div>
            <h3 class="h5 fw-bold mb-1">Mensal por data</h3>
            <p class="mb-0">Resumo mensal com base na data das movimentações que afetam o saldo.</p>
          </div>
          <div class="col-lg-3 col-md-4 p-0">
            <label class="form-label fw-semibold">Mês</label>
            <input v-model="selectedMonth" type="month" class="form-control rounded-4" />
          </div>
        </div>

        <div class="row g-3">
          <div class="col-lg-3 col-md-6">
            <MetricCard title="Entradas" :value="money(monthlySummary.entries)" :hint="monthLabel" icon="fa-solid fa-arrow-trend-up" tone="success" />
          </div>
          <div class="col-lg-3 col-md-6">
            <MetricCard title="Saídas" :value="money(monthlySummary.expenses)" :hint="monthLabel" icon="fa-solid fa-arrow-trend-down" tone="danger" />
          </div>
          <div class="col-lg-3 col-md-6">
            <MetricCard title="Líquido" :value="money(monthlySummary.net)" :hint="monthLabel" icon="fa-solid fa-scale-balanced" :tone="monthlySummary.net < 0 ? 'warning' : 'info'" />
          </div>
          <div class="col-lg-3 col-md-6">
            <MetricCard title="Movimentações" :value="monthMovementRows.length" :hint="`${monthMovementRows.length} lançamento(s) no mês`" icon="fa-solid fa-list-check" tone="primary" />
          </div>
        </div>

        <div v-if="monthMovementRows.length" class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Conta</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in monthMovementRows.slice(0, 60)" :key="entry.id">
                <td>{{ dateLabel(entry.movement_date) }}</td>
                <td>{{ entry.description }}</td>
                <td>{{ movementAccountLabel(entry) }}</td>
                <td>
                  <span :class="`badge text-bg-${entryTone(entry)}`">
                    {{ entryLabel(entry) }}
                  </span>
                </td>
                <td>{{ money(entry.amount) }}</td>
                <td>
                  <button
                    v-if="canRevertMovement(entry)"
                    class="btn btn-sm btn-outline-danger rounded-pill"
                    :disabled="revertingMovementId === entry.id"
                    @click="revertMovement(entry)">
                    {{ revertingMovementId === entry.id ? "Desfazendo..." : "Reverter" }}
                  </button>
                  <button
                    v-if="canEditMovement(entry)"
                    class="btn btn-sm btn-outline-primary rounded-pill ms-2"
                    @click="openEditFinanceModal(entry)">
                    Editar
                  </button>
                  <span v-else-if="!canRevertMovement(entry)">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else>Nenhuma movimentação encontrada para o mês selecionado.</div>
      </div>
    </section>

    <section v-else class="panel-card">
      <div>Não foi possível carregar o saldo da loja.</div>
    </section>

    <ModalDialog v-model="showOpenCashModal" title="Abrir caixa" eyebrow="Financeiro" size="lg">
      <div class="d-grid gap-3">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label fw-semibold">Valor de abertura</label>
            <input v-model.number="openCashForm.openingAmount" type="number" min="0" step="0.01" class="form-control rounded-4" />
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold">Data</label>
            <input :value="getTodayString()" type="date" class="form-control rounded-4" disabled />
          </div>
          <div class="col-12">
            <label class="form-label fw-semibold">Observação</label>
            <textarea v-model="openCashForm.notes" rows="3" class="form-control rounded-4" placeholder="Referência do ciclo, observação de abertura, responsável..."></textarea>
          </div>
        </div>

        <div class="small">Esse caixa ficará aberto para todos os perfis da mesma loja até o fechamento manual.</div>

        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-outline-secondary rounded-pill" :disabled="savingCashSession" @click="showOpenCashModal = false">Cancelar</button>
          <button class="btn btn-primary rounded-pill" :disabled="savingCashSession" @click="saveOpenCashSession">
            <i class="fa-solid fa-door-open me-2"></i>
            {{ savingCashSession ? 'Abrindo...' : 'Abrir caixa' }}
          </button>
        </div>
      </div>
    </ModalDialog>

    <ModalDialog v-model="showCloseCashModal" title="Fechar caixa" eyebrow="Financeiro" size="lg">
      <div class="d-grid gap-3">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label fw-semibold">Valor de fechamento</label>
            <input v-model.number="closeCashForm.closingAmount" type="number" min="0" step="0.01" class="form-control rounded-4" />
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold">Esperado agora</label>
            <input :value="money(totalBalance)" class="form-control rounded-4" disabled />
          </div>
          <div class="col-12">
            <label class="form-label fw-semibold">Observação</label>
            <textarea v-model="closeCashForm.notes" rows="3" class="form-control rounded-4" placeholder="Conferência do fechamento, diferença encontrada, observação geral..."></textarea>
          </div>
        </div>

        <div class="small">O fechamento encerra manualmente o ciclo atual e mantém o histórico para conferência futura.</div>

        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-outline-secondary rounded-pill" :disabled="savingCashSession" @click="showCloseCashModal = false">Cancelar</button>
          <button class="btn btn-warning rounded-pill" :disabled="savingCashSession || !activeCashSession" @click="saveCloseCashSession">
            <i class="fa-solid fa-door-closed me-2"></i>
            {{ savingCashSession ? 'Fechando...' : 'Fechar caixa' }}
          </button>
        </div>
      </div>
    </ModalDialog>

    <ModalDialog v-model="showEditFinanceModal" title="Editar lançamento" eyebrow="Financeiro" size="lg">
      <div class="d-grid gap-3">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label fw-semibold">Tipo</label>
            <select v-model="editFinanceForm.entryType" class="form-select rounded-4">
              <option value="DESPESA">Saída</option>
              <option value="RECEITA">Entrada</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold">Categoria</label>
            <select v-model="editFinanceForm.category" class="form-select rounded-4">
              <option v-for="category in editFinanceCategoryOptions" :key="category.id" :value="category.name">{{ category.name }}</option>
            </select>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-md-7">
            <label class="form-label fw-semibold">Descrição</label>
            <input v-model="editFinanceForm.description" class="form-control rounded-4" />
          </div>
          <div class="col-md-5">
            <label class="form-label fw-semibold">Valor</label>
            <input v-model.number="editFinanceForm.amount" type="number" min="0" step="0.01" class="form-control rounded-4" />
          </div>
        </div>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label fw-semibold">Conta impactada</label>
            <select v-model.number="editFinanceForm.cashAccountId" class="form-select rounded-4">
              <option :value="0">Selecione</option>
              <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold">Data</label>
            <input v-model="editFinanceForm.entryDate" type="date" class="form-control rounded-4" />
          </div>
        </div>
        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-outline-secondary rounded-pill" :disabled="savingEditFinance" @click="showEditFinanceModal = false">Cancelar</button>
          <button class="btn btn-primary rounded-pill" :disabled="savingEditFinance" @click="saveEditedFinance">
            {{ savingEditFinance ? "Salvando..." : "Salvar alterações" }}
          </button>
        </div>
      </div>
    </ModalDialog>

    <ModalDialog v-model="showExpenseModal" title="Lançar saída" eyebrow="Financeiro" size="lg">
      <div class="d-grid gap-3">
        <div class="row g-3">
          <div class="col-md-7">
            <label class="form-label fw-semibold">Descrição</label>
            <input v-model="expenseForm.description" class="form-control rounded-4" placeholder="Ex.: retirada, taxa, frete, ajuste manual" />
          </div>
          <div class="col-md-5">
            <label class="form-label fw-semibold">Valor</label>
            <input v-model.number="expenseForm.amount" type="number" min="0" step="0.01" class="form-control rounded-4" />
          </div>
        </div>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label fw-semibold">Categoria</label>
            <select v-model="expenseForm.category" class="form-select rounded-4">
              <option v-if="!expenseCategories.length" value="" disabled>Carregando categorias...</option>
              <option v-for="category in expenseCategories" :key="category.id" :value="category.name">{{ category.name }}</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold">Conta impactada</label>
            <select v-model.number="expenseForm.cashAccountId" class="form-select rounded-4">
              <option :value="0">Selecione</option>
              <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
            </select>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label fw-semibold">Data</label>
            <input v-model="expenseForm.entryDate" type="date" class="form-control rounded-4" />
          </div>
        </div>

        <div class="small">A saída entra direto no saldo da conta escolhida e passa a aparecer tanto no ciclo manual quanto no fluxo mensal por data.</div>

        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-outline-secondary rounded-pill" :disabled="savingExpense" @click="showExpenseModal = false">Cancelar</button>
          <button class="btn btn-primary rounded-pill" :disabled="savingExpense" @click="saveExpense">
            <i class="fa-solid fa-floppy-disk me-2"></i>
            {{ savingExpense ? "Salvando..." : "Salvar saída" }}
          </button>
        </div>
      </div>
    </ModalDialog>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import MetricCard from "../components/MetricCard.vue";
import ModalDialog from "../components/ModalDialog.vue";
import { api } from "../services/api";
import { currency } from "../services/format";
import { notifyError, notifySuccess } from "../services/ui";
import type { CashSession, FinanceWorkbookPayload, FinanceCategory, StoreCashAccount, StoreCashMovement } from "../services/types";

const workbook = ref<FinanceWorkbookPayload | null>(null);
const cashSessions = ref<CashSession[]>([]);
const loading = ref(false);
const showExpenseModal = ref(false);
const showEditFinanceModal = ref(false);
const showOpenCashModal = ref(false);
const showCloseCashModal = ref(false);
const savingExpense = ref(false);
const savingEditFinance = ref(false);
const savingCashSession = ref(false);
const revertingMovementId = ref(0);
const selectedCycleId = ref(0);
const selectedMonth = ref(getCurrentMonthString());

const expenseForm = reactive({
  description: "",
  amount: 0,
  entryDate: getTodayString(),
  cashAccountId: 0,
  category: ""
});

const editFinanceForm = reactive({
  id: 0,
  entryType: "DESPESA",
  category: "",
  description: "",
  amount: 0,
  entryDate: getTodayString(),
  cashAccountId: 0
});

const openCashForm = reactive({
  openingAmount: 0,
  notes: ""
});

const closeCashForm = reactive({
  closingAmount: 0,
  notes: ""
});

const accounts = computed<StoreCashAccount[]>(() => (workbook.value?.accounts || []).filter((account) => Number(account.active) === 1));
const ledger = computed<StoreCashMovement[]>(() => workbook.value?.ledger || []);
const totalBalance = computed(() => roundMoney(accounts.value.reduce((sum, account) => sum + Number(account.balance_amount || 0), 0)));
const groupedRows = computed(() => [
  {
    label: "Conta",
    value: roundMoney(readAccountBalance("CC_PIX_PJ_MAQ_VERM") + readAccountBalance("MAQ_AMARELA_PIX_CEL"))
  },
  {
    label: "Dinheiro",
    value: roundMoney(readAccountBalance("CAIXINHA_LOJA") + readAccountBalance("R_COM_DENIO"))
  },
  {
    label: "Outros",
    value: roundMoney(readAccountBalance("OUTROS_REGINA") + readAccountBalance("BOLETOS"))
  }
]);
const financeCategories = ref<FinanceCategory[]>([]);
const expenseCategories = computed(() => financeCategories.value.filter((category) => String(category.entry_type || "").toUpperCase() === "DESPESA" && Number(category.active) === 1));
const defaultExpenseCategory = computed(() => expenseCategories.value.find((category) => Number(category.active) === 1)?.name || "Outras despesas");
const editFinanceCategoryOptions = computed(() => financeCategories.value.filter((category) => String(category.entry_type || "").toUpperCase() === String(editFinanceForm.entryType || "DESPESA").toUpperCase() && Number(category.active) === 1));
const othersAccountId = computed(() => Number(accounts.value.find((item) => item.code === "OUTROS")?.id || 0));
const othersBalance = computed(() => readAccountBalance("OUTROS"));
const activeCashSession = computed<CashSession | null>(() => cashSessions.value.find((sessionItem) => String(sessionItem.status || "").toUpperCase() === "OPEN") || null);
const selectedCycle = computed<CashSession | null>(() => {
  if (selectedCycleId.value) {
    return cashSessions.value.find((sessionItem) => Number(sessionItem.id) === Number(selectedCycleId.value)) || null;
  }
  return activeCashSession.value || cashSessions.value[0] || null;
});
const cycleMovementRows = computed<StoreCashMovement[]>(() => {
  if (!selectedCycle.value) {
    return [];
  }
  const fromDate = normalizeDateOnly(selectedCycle.value.opened_at);
  const toDate = normalizeDateOnly(selectedCycle.value.closed_at || getTodayString());
  return ledger.value.filter((entry) => isDateBetween(normalizeDateOnly(entry.movement_date), fromDate, toDate));
});
const cycleSummary = computed(() => summarizeMovements(cycleMovementRows.value));
const cycleClosingAmount = computed(() => {
  if (!selectedCycle.value) {
    return 0;
  }
  if (String(selectedCycle.value.status) === "CLOSED") {
    return roundMoney(Number(selectedCycle.value.closing_amount || 0));
  }
  return totalBalance.value;
});
const cycleExpectedAmount = computed(() => {
  if (!selectedCycle.value) {
    return 0;
  }
  if (String(selectedCycle.value.status) === "CLOSED") {
    return roundMoney(Number(selectedCycle.value.expected_amount || 0));
  }
  return roundMoney(Number(selectedCycle.value.opening_amount || 0) + cycleSummary.value.net);
});
const cycleBalanceDelta = computed(() => {
  if (!selectedCycle.value) {
    return 0;
  }
  return roundMoney(cycleClosingAmount.value - Number(selectedCycle.value.opening_amount || 0));
});
const cycleClosingDifference = computed(() => roundMoney(cycleClosingAmount.value - cycleExpectedAmount.value));
const monthRange = computed(() => buildMonthRange(selectedMonth.value));
const monthMovementRows = computed<StoreCashMovement[]>(() => ledger.value.filter((entry) => isDateBetween(normalizeDateOnly(entry.movement_date), monthRange.value.fromDate, monthRange.value.toDate)));
const monthlySummary = computed(() => summarizeMovements(monthMovementRows.value));
const monthLabel = computed(() => formatMonthLabel(selectedMonth.value));

function getTodayString() {
  const today = new Date();
  const year = String(today.getFullYear());
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonthString() {
  return getTodayString().slice(0, 7);
}

function roundMoney(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function money(value: number | null | undefined) {
  return currency(Number(value || 0));
}

function readAccountBalance(code: string) {
  const account = accounts.value.find((item) => item.code === code);
  return roundMoney(Number(account?.balance_amount || 0));
}

function normalizeDateOnly(value: string | null | undefined) {
  return String(value || "").slice(0, 10);
}

function isDateBetween(value: string, fromDate: string, toDate: string) {
  if (!value) {
    return false;
  }
  if (fromDate && value < fromDate) {
    return false;
  }
  if (toDate && value > toDate) {
    return false;
  }
  return true;
}

function summarizeMovements(entries: StoreCashMovement[]) {
  return entries.reduce(
    (summary, entry) => {
      const isExpense = String(entry.entry_type || "").toUpperCase() === "DESPESA";
      const amount = Number(entry.amount || 0);
      if (isExpense) {
        summary.expenses += amount;
        summary.net -= amount;
      } else {
        summary.entries += amount;
        summary.net += amount;
      }
      return summary;
    },
    { entries: 0, expenses: 0, net: 0 }
  );
}

function buildMonthRange(monthValue: string) {
  const normalized = /^\d{4}-\d{2}$/.test(String(monthValue || "")) ? String(monthValue) : getCurrentMonthString();
  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    fromDate: `${yearText}-${monthText}-01`,
    toDate: `${yearText}-${monthText}-${String(lastDay).padStart(2, "0")}`
  };
}

function formatMonthLabel(monthValue: string) {
  const normalized = /^\d{4}-\d{2}$/.test(String(monthValue || "")) ? String(monthValue) : getCurrentMonthString();
  const [year, month] = normalized.split("-");
  return `${month}/${year}`;
}

function dateLabel(value: string) {
  const normalized = normalizeDateOnly(value);
  if (!normalized) {
    return "-";
  }
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

function entryTone(entry: StoreCashMovement) {
  return String(entry.entry_type || "").toUpperCase() === "DESPESA" ? "danger" : "success";
}

function movementAccountLabel(entry: StoreCashMovement) {
  return String(entry.cash_account_name || entry.cash_account_code || entry.finance_payment_method || "-");
}

function canRevertMovement(entry: StoreCashMovement) {
  return Number(entry.replenishment_id || 0) > 0 || Number(entry.finance_entry_id || 0) > 0;
}

function parseMovementPayload(entry: StoreCashMovement) {
  try {
    return JSON.parse(String(entry.raw_payload || "{}"));
  } catch {
    return {};
  }
}

function canEditMovement(entry: StoreCashMovement) {
  const rawPayload = parseMovementPayload(entry);
  const source = String(rawPayload.source || rawPayload.origin || "").toUpperCase();
  if (Number(entry.replenishment_id || 0) > 0) {
    return false;
  }
  if (source.startsWith("CATALOG_") || source === "ORDER_COMPLETION" || source === "PDV_PAYMENT") {
    return false;
  }
  return Number(entry.finance_entry_id || 0) > 0;
}

async function revertMovement(entry: StoreCashMovement) {
  const confirmed = window.confirm("Reverter esta transação? Se ela vier de reposição de estoque, o estoque também será desfeito.");
  if (!confirmed) {
    return;
  }
  try {
    revertingMovementId.value = Number(entry.id || 0);
    await api.revertFinanceTransaction({
      financeEntryId: Number(entry.finance_entry_id || 0) || undefined,
      replenishmentId: Number(entry.replenishment_id || 0) || undefined
    });
    await loadWorkbook();
    await notifySuccess("Transação revertida");
  } catch (error) {
    await notifyError(error);
  } finally {
    revertingMovementId.value = 0;
  }
}

function entryLabel(entry: StoreCashMovement) {
  return String(entry.entry_type || "").toUpperCase() === "DESPESA" ? "Saída" : "Entrada";
}



function resetEditFinanceForm() {
  editFinanceForm.id = 0;
  editFinanceForm.entryType = "DESPESA";
  editFinanceForm.category = defaultExpenseCategory.value;
  editFinanceForm.description = "";
  editFinanceForm.amount = 0;
  editFinanceForm.entryDate = getTodayString();
  editFinanceForm.cashAccountId = othersAccountId.value || Number(accounts.value[0]?.id || 0);
}

function openEditFinanceModal(entry: StoreCashMovement) {
  if (!canEditMovement(entry) || !Number(entry.finance_entry_id || 0)) {
    void notifyError(new Error("Esse lançamento não pode ser alterado por esta tela."));
    return;
  }
  editFinanceForm.id = Number(entry.finance_entry_id || 0);
  editFinanceForm.entryType = String(entry.entry_type || "DESPESA").toUpperCase();
  editFinanceForm.category = String(entry.finance_category || "").trim();
  editFinanceForm.description = String(entry.description || "");
  editFinanceForm.amount = Number(entry.amount || 0);
  editFinanceForm.entryDate = normalizeDateOnly(entry.movement_date) || getTodayString();
  editFinanceForm.cashAccountId = Number(entry.cash_account_id || 0);
  if (!editFinanceForm.category) {
    editFinanceForm.category = editFinanceCategoryOptions.value[0]?.name || defaultExpenseCategory.value;
  }
  showEditFinanceModal.value = true;
}

async function saveEditedFinance() {
  try {
    if (!editFinanceForm.id) {
      throw new Error("Lançamento inválido para edição.");
    }
    if (!editFinanceForm.description.trim()) {
      throw new Error("Descreva o lançamento antes de salvar.");
    }
    if (Number(editFinanceForm.amount || 0) <= 0) {
      throw new Error("Informe um valor maior que zero.");
    }
    if (!Number(editFinanceForm.cashAccountId || 0)) {
      throw new Error("Selecione a conta impactada.");
    }
    const fallbackCategory = editFinanceCategoryOptions.value[0]?.name || defaultExpenseCategory.value;
    savingEditFinance.value = true;
    await api.saveFinance({
      id: Number(editFinanceForm.id),
      entryType: editFinanceForm.entryType,
      category: (editFinanceForm.category || fallbackCategory).trim(),
      description: editFinanceForm.description.trim(),
      amount: Number(editFinanceForm.amount || 0),
      entryDate: editFinanceForm.entryDate || getTodayString(),
      paymentMethod: "NAO_DEFINIDO",
      cashAccountId: Number(editFinanceForm.cashAccountId),
      legacySection: "ENTRADAS_SAIDAS"
    });
    showEditFinanceModal.value = false;
    await loadWorkbook();
    await notifySuccess("Lançamento atualizado");
  } catch (error) {
    await notifyError(error);
  } finally {
    savingEditFinance.value = false;
  }
}

function cashSessionLabel(sessionItem: CashSession) {
  const opened = dateLabel(sessionItem.opened_at);
  const closed = sessionItem.closed_at ? dateLabel(sessionItem.closed_at) : "aberto";
  const status = sessionItem.status === "OPEN" ? "Aberto" : "Fechado";
  return `#${sessionItem.id} | ${opened} -> ${closed} | ${status}`;
}

function resetExpenseForm() {
  expenseForm.description = "";
  expenseForm.amount = 0;
  expenseForm.entryDate = getTodayString();
  expenseForm.category = defaultExpenseCategory.value;
  expenseForm.cashAccountId = othersAccountId.value || Number(accounts.value[0]?.id || 0);
}


function resetOpenCashForm() {
  openCashForm.openingAmount = totalBalance.value;
  openCashForm.notes = "";
}

function resetCloseCashForm() {
  closeCashForm.closingAmount = totalBalance.value;
  closeCashForm.notes = selectedCycle.value?.notes || "";
}

function openExpenseModal() {
  resetExpenseForm();
  showExpenseModal.value = true;
}

function openOpenCashModal() {
  resetOpenCashForm();
  showOpenCashModal.value = true;
}

function openCloseCashModal() {
  resetCloseCashForm();
  showCloseCashModal.value = true;
}

async function saveOpenCashSession() {
  try {
    savingCashSession.value = true;
    await api.openCashSession({
      openingAmount: Number(openCashForm.openingAmount || 0),
      notes: openCashForm.notes.trim()
    });
    showOpenCashModal.value = false;
    await loadWorkbook();
    await notifySuccess("Caixa aberto");
  } catch (error) {
    await notifyError(error);
  } finally {
    savingCashSession.value = false;
  }
}

async function saveCloseCashSession() {
  try {
    if (!activeCashSession.value) {
      throw new Error("Nenhum caixa aberto para fechar.");
    }
    savingCashSession.value = true;
    await api.closeCashSession(activeCashSession.value.id, {
      closingAmount: Number(closeCashForm.closingAmount || 0),
      notes: closeCashForm.notes.trim()
    });
    showCloseCashModal.value = false;
    await loadWorkbook();
    await notifySuccess("Caixa fechado");
  } catch (error) {
    await notifyError(error);
  } finally {
    savingCashSession.value = false;
  }
}

async function saveExpense() {
  try {
    if (!expenseForm.description.trim()) {
      throw new Error("Descreva a saída antes de salvar.");
    }
    if (Number(expenseForm.amount || 0) <= 0) {
      throw new Error("Informe um valor maior que zero para a saída.");
    }
    if (!Number(expenseForm.cashAccountId || 0)) {
      throw new Error("Selecione a conta que será impactada.");
    }

    savingExpense.value = true;
    const categoryName = (expenseForm.category || defaultExpenseCategory.value).trim() || defaultExpenseCategory.value;
    await api.saveFinance({
      entryType: "DESPESA",
      category: categoryName,
      description: expenseForm.description.trim(),
      amount: Number(expenseForm.amount || 0),
      entryDate: expenseForm.entryDate || getTodayString(),
      paymentMethod: "NAO_DEFINIDO",
      cashAccountId: Number(expenseForm.cashAccountId),
      legacySection: "ENTRADAS_SAIDAS"
    });
    showExpenseModal.value = false;
    await loadWorkbook();
    await notifySuccess("Saída registrada");
  } catch (error) {
    await notifyError(error);
  } finally {
    savingExpense.value = false;
  }
}

async function loadWorkbook() {
  try {
    loading.value = true;
    const [workbookResponse, categoriesResponse] = await Promise.all([
      api.financeWorkbook(),
      api.financeCategories()
    ]);
    workbook.value = workbookResponse.data;
    financeCategories.value = categoriesResponse.data.filter((category) => Number(category.active) === 1);
    const sessionsResponse = await api.cashSessions({ storeId: String(workbookResponse.data.store.id || "") });
    cashSessions.value = sessionsResponse.data;
    if (activeCashSession.value) {
      selectedCycleId.value = Number(activeCashSession.value.id);
    } else if (cashSessions.value.length) {
      selectedCycleId.value = Number(cashSessions.value[0].id);
    } else {
      selectedCycleId.value = 0;
    }
  } catch (error) {
    await notifyError(error);
  } finally {
    loading.value = false;
  }
}

onMounted(loadWorkbook);
</script>
