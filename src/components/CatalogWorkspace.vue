<template>
 <AppShell :title="title" :subtitle="subtitle">
 <template #actions>
 <FilterDrawer :title="`Filtros de ${title.toLowerCase()}`" @apply="loadItems" @clear="clearFilters">
 <div class="d-grid gap-3">
 <div>
 <label class="form-label fw-semibold">Buscar</label>
 <input v-model="filters.search" class="form-control rounded-4" :placeholder="'Nome, marca, descrição, categoria ou subcategoria'" />
 </div>
 <div class="row g-3">
 <div class="col-md-6">
 <label class="form-label fw-semibold">Categoria</label>
 <select v-model="filters.category" class="form-select rounded-4">
 <option value="">Todas</option>
 <option v-for="category in session.meta?.catalogCategories || []" :key="category" :value="category">{{ category }}</option>
 </select>
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold">Condição</label>
 <select v-model="filters.itemCondition" class="form-select rounded-4">
 <option value="">Todas</option>
 <option v-for="condition in session.meta?.itemConditions || []" :key="condition.code" :value="condition.code">{{ condition.label }}</option>
 </select>
 </div>
 </div>
 <div class="row g-3">
 <div class="col-md-6">
 <label class="form-label fw-semibold d-flex align-items-center gap-2">
 <input v-model="filters.lowStockOnly" class="form-check-input mt-0" type="checkbox" />
 Mostrar apenas baixo estoque
 </label>
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold d-flex align-items-center gap-2">
 <input v-model="filters.activeOnly" class="form-check-input mt-0" type="checkbox" />
 Mostrar apenas ativos
 </label>
 </div>
 </div>
 <div v-if="!storeInventoryOnly">
 <label class="form-label fw-semibold d-flex align-items-center gap-2">
 <input v-model="filters.onlyStoreInventory" class="form-check-input mt-0" type="checkbox" />
 Mostrar apenas itens do inventário da loja
 </label>
 </div>
 </div>
 </FilterDrawer>
 <button v-if="!storeInventoryOnly" class="btn btn-outline-primary rounded-pill" @click="openBatchCreate">
 <i class="fa-solid fa-table-cells-large me-2"></i>
 Adicionar em massa
 </button>
 <button class="btn btn-primary rounded-pill" @click="openCreate">
 <i class="fa-solid fa-plus me-2"></i>
 {{ createLabel }}
 </button>
 </template>

 <div class="row g-4 mb-4">
 <div class="col-lg-3 col-md-6">
 <MetricCard :title="storeInventoryOnly ? 'Itens em loja' : 'Itens catalogados'" :value="items.length" hint="Base viva conectada ao estoque e ao uso operacional." icon="fa-solid fa-cubes" tone="primary" />
 </div>
 <div class="col-lg-3 col-md-6">
 <MetricCard title="Valor em estoque" :value="currency(stockValue)" hint="Capital total dos itens visíveis no filtro atual." icon="fa-solid fa-warehouse" tone="success" />
 </div>
 <div class="col-lg-3 col-md-6">
 <MetricCard title="Abaixo do mínimo" :value="lowStockCount" hint="Itens pedindo reposição ou atenão de compra." icon="fa-solid fa-triangle-exclamation" tone="danger" />
 </div>
 <div class="col-lg-3 col-md-6">
 <MetricCard title="Margem média" :value="averageProfitLabel" hint="Percentual médio de lucro dos itens visíveis na listagem." icon="fa-solid fa-percent" tone="warning" />
 </div>
 </div>

 <DataTable
 ref="catalogTable"
 :title="tableTitle"
 :eyebrow="eyebrow"
 :rows="items"
 :columns="columns"
 :allow-csv="true"
 :allow-print="true"
 :allow-auto-columns="true"
 :selectable-rows="true"
 responsive-mode="auto"
 :card-title="(row) => row.name || 'Item'"
 :card-subtitle="(row) => [row.brand, row.category, row.subcategory].filter(Boolean).join(' | ')"
 :card-fields="catalogCardFields"
 :card-badge="catalogCardBadge"
 :card-actions="catalogCardActions"
 @selection-change="handleSelectionChange"
 @row-click="openDetail"
 />

 <SelectionActionBar class="mt-4" :selected-count="selectedCount" item-label="item(ns)" @select-all="selectAllItems" @clear="clearSelection">
 <button class="btn btn-outline-primary rounded-pill" :disabled="!selectedCount" @click="openBatchRestock">
 <i class="fa-solid fa-boxes-stacked me-2"></i>
 Repor em lote
 </button>
 <button class="btn btn-danger rounded-pill" :disabled="!selectedCount" @click="removeSelectedItems">
 <i class="fa-solid fa-trash me-2"></i>
 Excluir selecionados
 </button>
 </SelectionActionBar>

 <ModalDialog v-model="showDetail" title="Perfil completo do item" :eyebrow="eyebrow" size="xl">
 <div v-if="selectedItem" class="d-grid gap-4">
 <div class="hero-banner">
 <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
 <div>
 <div class="small opacity-75 mb-2">Estoque conectado ? operação</div>
 <h3 class="h2 fw-bold mb-1">{{ selectedItem.name }}</h3>
 <div class="text-white-50">
 {{ selectedItem.sku || 'Sem SKU' }}<span v-if="selectedItem.brand"> | {{ selectedItem.brand }}</span> | {{ selectedItem.category }}<span v-if="selectedItem.subcategory"> | {{ selectedItem.subcategory }}</span>
 </div>
 </div>
 <div class="table-actions">
 <span :class="`badge text-bg-${stockHealthTone(selectedItem.stock_health)}`">{{ selectedItem.stock_health_label }}</span>
 <button class="btn btn-light rounded-pill" @click="openRestock(selectedItem)">
 <i class="fa-solid fa-box-open me-2"></i>
 Reposição
 </button>
 <button class="btn btn-light rounded-pill" @click="openEdit(selectedItem)">
 <i class="fa-solid fa-pen me-2"></i>
 Editar
 </button>
 <button class="btn btn-outline-light rounded-pill" @click="removeItem(selectedItem)">
 <i class="fa-solid fa-trash me-2"></i>
 Excluir
 </button>
 </div>
 </div>
 </div>

 <div class="row g-4">
 <div class="col-lg-3 col-md-6">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-2">Estoque atual</div>
 <div class="display-6 fw-bold mb-1">{{ selectedItem.stock_quantity }}</div>
 <div>Disponível para venda, OS e PDV.</div>
 </div>
 </div>
 <div class="col-lg-3 col-md-6">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-2">Mínimo ideal</div>
 <div class="display-6 fw-bold mb-1">{{ selectedItem.min_stock }}</div>
 <div>Ponto de alerta para reposição.</div>
 </div>
 </div>
 <div class="col-lg-3 col-md-6">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-2">OS vinculadas</div>
 <div class="display-6 fw-bold mb-1">{{ selectedItem.linked_orders_count }}</div>
 <div>{{ selectedItem.active_orders_count }} ainda em andamento.</div>
 </div>
 </div>
 <div class="col-lg-3 col-md-6">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-2">Valor em estoque</div>
 <div class="display-6 fw-bold mb-1">{{ currency(selectedItem.stock_value) }}</div>
 <div>Margem unitária {{ currency(selectedItem.unit_margin) }} | Lucro {{ percentLabel(selectedItem.profit_percent) }}.</div>
 </div>
 </div>
 </div>

 <div class="row g-4">
 <div class="col-lg-6">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Cadastro do item</div>
 <div class="mb-2"><strong>SKU:</strong> {{ selectedItem.sku || 'Não informado' }}</div>
 <div class="mb-2"><strong>Marca:</strong> {{ selectedItem.brand || 'Não informada' }}</div>
 <div class="mb-2"><strong>Categoria:</strong> {{ selectedItem.category }}</div>
 <div class="mb-2"><strong>Subcategoria:</strong> {{ selectedItem.subcategory || 'Não informada' }}</div>
 <div class="mb-2"><strong>Descrição:</strong> {{ selectedItem.description || 'Sem descrição' }}</div>
 <div class="mb-2"><strong>Condição:</strong> {{ conditionLabel(selectedItem.item_condition) }}</div>
 <div class="mb-2"><strong>Destino:</strong> {{ locationTypeLabel(selectedItem.location_type || (selectedItem.is_store_inventory ? 'INVENTARIO' : 'ESTOQUE')) }}</div>
 <div class="mb-2"><strong>Status:</strong> {{ selectedItem.active ? 'Ativo' : 'Inativo' }}</div>
 </div>
 </div>
 <div class="col-lg-6">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Histórico comercial</div>
 <div class="mb-2"><strong>Custo unitário:</strong> {{ currency(selectedItem.cost_amount) }}</div>
 <div class="mb-2"><strong>Preço de venda:</strong> {{ currency(selectedItem.price_amount) }}</div>
 <div class="mb-2"><strong>Média compra:</strong> {{ currency(selectedItem.average_cost_amount) }}</div>
 <div class="mb-2"><strong>Média venda:</strong> {{ currency(selectedItem.average_price_amount) }}</div>
 <div class="mb-2"><strong>Último custo anterior:</strong> {{ currency(selectedItem.last_previous_cost_amount) }}</div>
 <div class="mb-2"><strong>Último preço anterior:</strong> {{ currency(selectedItem.last_previous_price_amount) }}</div>
 <div class="mb-2"><strong>Saída total:</strong> {{ selectedItem.total_quantity_used }}</div>
 <div class="mb-2"><strong>Reservado em OS abertas:</strong> {{ selectedItem.open_quantity }}</div>
 <div class="mb-2"><strong>Última OS:</strong> {{ selectedItem.last_order_code || 'Nenhuma ainda' }}</div>
 <div class="mb-2"><strong>Último uso:</strong> {{ dateLabel(selectedItem.last_used_at) }}</div>
 </div>
 </div>
 </div>

 <div class="panel-card">
 <div class="small fw-semibold mb-3">Histórico de reposição</div>
 <div v-if="selectedItem.replenishment_history.length" class="table-responsive">
 <table class="table align-middle">
 <thead>
 <tr>
 <th>Data</th>
 <th>Qtd</th>
 <th>Novo custo</th>
 <th>Novo preço</th>
 <th>Ult. custo ant.</th>
 <th>Ult. preço ant.</th>
 <th>Responsável</th>
 <th>Ações</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="(entry, index) in selectedItem.replenishment_history" :key="entry.id">
 <td>{{ dateLabel(entry.created_at) }}</td>
 <td>{{ entry.quantity }}</td>
 <td>{{ currency(entry.new_cost_amount) }}</td>
 <td>{{ currency(entry.new_price_amount) }}</td>
 <td>{{ currency(entry.previous_cost_amount) }}</td>
 <td>{{ currency(entry.previous_price_amount) }}</td>
 <td>{{ entry.actor_name || 'Sistema' }}</td>
 <td>
 <button
 class="btn btn-sm btn-outline-danger rounded-pill"
 :disabled="revertingReplenishmentId === entry.id || index !== 0"
 @click="revertReplenishment(entry, index)">
 <i class="fa-solid fa-rotate-left me-1"></i>
 {{ revertingReplenishmentId === entry.id ? 'Desfazendo...' : 'Desfazer' }}
 </button>
 </td>
 </tr>
 </tbody>
 </table>
 </div>
 <div v-else>Nenhuma reposição registrada para este item.</div>
 </div>

 <div class="panel-card">
 <div class="small fw-semibold mb-3">Histórico operacional</div>
 <div v-if="selectedItem.usage_history.length" class="table-responsive">
 <table class="table align-middle">
 <thead>
 <tr>
 <th>OS</th>
 <th>Cliente</th>
 <th>Equipamento</th>
 <th>Status</th>
 <th>Aprovação</th>
 <th>Qtd</th>
 <th>Total</th>
 <th>Atualizada</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="usage in selectedItem.usage_history" :key="usage.id">
 <td>{{ usage.order_code }}</td>
 <td>{{ usage.client_name }}</td>
 <td>{{ usage.equipment }}</td>
 <td><span :class="`badge text-bg-${orderStatusTone(usage.order_status)}`">{{ orderStatusLabel(usage.order_status) }}</span></td>
 <td><span :class="`badge text-bg-${approvalStatusTone(usage.approval_status)}`">{{ approvalStatusLabel(usage.approval_status) }}</span></td>
 <td>{{ usage.quantity }}</td>
 <td>{{ currency(usage.line_total) }}</td>
 <td>{{ dateLabel(usage.updated_at) }}</td>
 </tr>
 </tbody>
 </table>
 </div>
 <div v-else>Nenhuma OS consumiu este item ate o momento.</div>
 </div>
 </div>
 </ModalDialog>

 <ModalDialog v-model="showForm" :title="form.id ? 'Editar item' : createLabel" :eyebrow="eyebrow" size="xl">
 <form class="row g-4" @submit.prevent="saveItem">
 <div class="col-lg-8">
 <div class="panel-card h-100">
 <div class="row g-3">
 <div class="col-md-5">
 <label class="form-label fw-semibold required-label">Nome</label>
 <input v-model="form.name" class="form-control rounded-4" required />
 </div>
 <div class="col-md-3">
 <label class="form-label fw-semibold">Marca</label>
 <input v-model="form.brand" class="form-control rounded-4" placeholder="Ex.: Dell, Kingston, Logitech" />
 </div>
 <div class="col-md-4">
 <label class="form-label fw-semibold required-label">Categoria</label>
 <select v-model="form.category" class="form-select rounded-4" required>
 <option value="">Selecione</option>
 <option v-for="category in session.meta?.catalogCategories || []" :key="category" :value="category">{{ category }}</option>
 </select>
 </div>
 <div v-if="subcategoryOptions.length" class="col-md-6">
 <label class="form-label fw-semibold">Subcategoria</label>
 <select v-model="form.subcategory" class="form-select rounded-4">
 <option value="">Selecione</option>
 <option v-for="subcategory in subcategoryOptions" :key="subcategory" :value="subcategory">{{ subcategory }}</option>
 </select>
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold required-label">Condição</label>
 <select v-model="form.itemCondition" class="form-select rounded-4" required>
 <option v-for="condition in session.meta?.itemConditions || []" :key="condition.code" :value="condition.code">{{ condition.label }}</option>
 </select>
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold required-label">Destino</label>
 <select v-model="form.locationType" class="form-select rounded-4" required>
 <option value="ESTOQUE">Item do estoque</option>
 <option value="INVENTARIO">Item do inventário</option>
 </select>
 </div>
 <div class="col-12">
 <label class="form-label fw-semibold">Descrição</label>
 <textarea v-model="form.description" class="form-control rounded-4" rows="4" placeholder="Detalhes do item, estado visual, observações e contexto operacional."></textarea>
 </div>
 </div>
 </div>
 </div>
 <div class="col-lg-4 d-grid gap-4">
 <div class="panel-card">
 <div class="small fw-semibold mb-3">Detalhes avançados</div>
 <BarcodeField v-model="form.sku" label="SKU ou código do item" helper="Campo opcional. Use digitação, imagem ou câmera quando fizer sentido." placeholder="Digite ou leia o SKU" />
 </div>
 <div v-if="showStockSetupFields" class="panel-card">
 <div class="small fw-semibold mb-3">Estoque inicial</div>
 <div class="row g-3">
 <div class="col-6">
 <label class="form-label fw-semibold required-label">Quantidade</label>
 <input v-model.number="form.stockQuantity" type="number" min="0" class="form-control rounded-4" required />
 </div>
 <div class="col-6">
 <label class="form-label fw-semibold required-label">Mínimo</label>
 <input v-model.number="form.minStock" type="number" min="0" class="form-control rounded-4" required />
 </div>
 <div class="col-12">
 <label class="form-label fw-semibold required-label">Valor de compra</label>
 <input v-model.number="form.costAmount" type="number" min="0" step="0.01" class="form-control rounded-4" required />
 </div>
 <div class="col-12">
 <label class="form-label fw-semibold required-label">Valor de venda</label>
 <input v-model.number="form.priceAmount" type="number" min="0" step="0.01" class="form-control rounded-4" required />
 </div>
 <div class="col-12">
 <hr class="my-2 opacity-10" />
 <label class="form-label fw-semibold d-flex align-items-center gap-2">
 <input v-model="form.generateFinanceEntry" class="form-check-input mt-0" type="checkbox" />
 Lançar no financeiro
 </label>
 <div class="d-grid gap-2">
 <select v-model.number="form.cashAccountId" class="form-select form-select-sm rounded-4" :disabled="!form.generateFinanceEntry" :required="form.generateFinanceEntry">
 <option v-for="account in cashAccountOptions" :key="account.code" :value="Number(account.id)">{{ account.label }}</option>
 </select>
 <div v-if="form.generateFinanceEntry" class="small text-danger">Despesa automática: {{ currency(form.stockQuantity * form.costAmount) }}</div>
 <div v-else class="small">Cadastro inicial como migração: entra no estoque sem lançar despesa no fluxo de caixa.</div>
 </div>
 </div>
 </div>
 </div>
 <div v-else class="panel-card">
 <div class="small fw-semibold mb-2">Item de inventário</div>
 <div>Quantidade, mínimo e preços não são obrigatórios para itens do inventário. Se esse item migrar para estoque, você poderá definir esses dados na edição ou pela reposição.</div>
 </div>
 </div>

 <div class="col-12 d-flex justify-content-end gap-2">
 <button type="button" class="btn btn-light rounded-pill" @click="showForm = false">Cancelar</button>
 <button class="btn btn-primary rounded-pill">
 <i class="fa-solid fa-floppy-disk me-2"></i>
 Salvar item
 </button>
 </div>
 </form>
 </ModalDialog>
 <ModalDialog v-model="showRestock" title="Reposição do item" :eyebrow="eyebrow" size="full">
 <div v-if="restockTarget" class="d-grid gap-4">
 <div class="panel-card">
 <div class="row g-3">
 <div class="col-md-6">
 <div class="small fw-semibold mb-2">Item</div>
 <div class="fw-bold">{{ restockTarget.name }}</div>
 <div class="small">{{ restockTarget.sku || 'Sem SKU' }}<span v-if="restockTarget.brand"> | {{ restockTarget.brand }}</span> | {{ restockTarget.category }}</div>
 </div>
 <div class="col-md-3">
 <div class="small fw-semibold mb-2">Média compra</div>
 <div class="fw-bold">{{ currency(restockTarget.average_cost_amount) }}</div>
 <div class="small">Ult. ant. {{ currency(restockTarget.last_previous_cost_amount) }}</div>
 </div>
 <div class="col-md-3">
 <div class="small fw-semibold mb-2">Média venda</div>
 <div class="fw-bold">{{ currency(restockTarget.average_price_amount) }}</div>
 <div class="small">Ult. ant. {{ currency(restockTarget.last_previous_price_amount) }}</div>
 </div>
 </div>
 </div>

 <form class="row g-3" @submit.prevent="submitRestock">
 <div class="col-md-4">
 <label class="form-label fw-semibold">Quantidade da reposição</label>
 <input v-model.number="restockForm.quantity" type="number" min="1" class="form-control rounded-4" required />
 </div>
 <div class="col-md-4">
 <label class="form-label fw-semibold">Novo valor de compra</label>
 <input v-model.number="restockForm.costAmount" type="number" step="0.01" min="0" class="form-control rounded-4" required />
 </div>
 <div class="col-md-4">
 <label class="form-label fw-semibold">Novo valor de venda</label>
 <input v-model.number="restockForm.priceAmount" type="number" step="0.01" min="0" class="form-control rounded-4" required />
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold">Custo adicional</label>
 <input v-model.number="restockForm.additionalCost" type="number" step="0.01" class="form-control rounded-4" />
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold">Observação</label>
 <textarea v-model="restockForm.notes" rows="3" class="form-control rounded-4" placeholder="Fornecedor, lote, motivo da atualizacao de preço..."></textarea>
 </div>
 <div class="col-12">
 <div class="panel-card bg-light border-0">
 <div class="d-flex align-items-center gap-3">
 <label class="form-label fw-semibold mb-0">Conta para débito:</label>
 <select v-model.number="restockForm.cashAccountId" class="form-select rounded-pill" style="width: auto; min-width: 200px;" required>
 <option v-for="account in cashAccountOptions" :key="account.code" :value="Number(account.id)">{{ account.label }}</option>
 </select>
 </div>
 <div class="small mt-2">
 O valor total de <strong>{{ currency(restockForm.quantity * restockForm.costAmount + (restockForm.additionalCost || 0)) }}</strong> será lançado automaticamente como despesa na conta selecionada.
 </div>
 </div>
 </div>
 <div class="col-12 d-flex justify-content-end gap-2">
 <button type="button" class="btn btn-light rounded-pill" @click="closeRestock">Cancelar</button>
 <button class="btn btn-primary rounded-pill">
 <i class="fa-solid fa-box-open me-2"></i>
 Confirmar reposição automática
 </button>
 </div>
 </form>
 </div>
 </ModalDialog>

 <ModalDialog v-model="showBatchRestock" title="Reposição em lote" :eyebrow="eyebrow" size="full">
 <div class="d-grid gap-3">
 <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
 <div class="small">Selecione os itens na lista, confira valores e faça uma única confirmação para atualizar o estoque.</div>
 <div class="panel-card bg-light border-0 py-2 px-3 mb-0">
 <div class="d-flex align-items-center gap-3">
 <span class="small fw-semibold opacity-75">Global:</span>
 <label class="form-check form-switch mb-0">
 <input class="form-check-input" type="checkbox" @change="(e: any) => batchRestockRows.forEach(r => r.generateFinanceEntry = e.target.checked)" />
 <span class="form-check-label small fw-semibold">Lançar financeiro</span>
 </label>
 <select class="form-select form-select-sm rounded-pill" style="width: auto;" @change="(e: any) => batchRestockRows.forEach(r => r.cashAccountId = Number(e.target.value))">
 <option v-for="account in cashAccountOptions" :key="account.code" :value="Number(account.id)">{{ account.label }}</option>
 </select>
 </div>
 </div>
 </div>
 <div class="table-responsive">
 <table class="table align-middle">
 <thead>
 <tr>
 <th>Nome</th>
 <th style="width: 190px;">Novo custo</th>
 <th style="width: 190px;">Novo preço</th>
 <th style="width: 130px;">Qtd</th>
 <th style="width: 170px;">Custo add.</th>
 <th style="width: 130px;">Finan?</th>
 <th style="width: 260px;">Conta</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="item in batchRestockRows" :key="item.id">
 <td>
 <div class="fw-semibold" style="min-width: 320px;" :title="item.name">{{ item.name }}</div>
 </td>
 <td><input v-model.number="item.costAmount" type="number" step="0.01" min="0" class="form-control form-control-sm rounded-4" /></td>
 <td><input v-model.number="item.priceAmount" type="number" step="0.01" min="0" class="form-control form-control-sm rounded-4" /></td>
 <td><input v-model.number="item.quantity" type="number" min="1" class="form-control form-control-sm rounded-4" /></td>
 <td><input v-model.number="item.additionalCost" type="number" step="0.01" class="form-control form-control-sm rounded-4" /></td>
 <td>
 <div class="form-check form-switch">
 <input v-model="item.generateFinanceEntry" class="form-check-input" type="checkbox" />
 </div>
 </td>
 <td>
 <select v-model.number="item.cashAccountId" class="form-select form-select-sm rounded-4" :disabled="!item.generateFinanceEntry">
 <option v-for="account in cashAccountOptions" :key="account.code" :value="Number(account.id)">{{ account.label }}</option>
 </select>
 </td>
 </tr>
 </tbody>
 </table>
 </div>
 <div class="small">Custo adicional entra apenas como despesa no financeiro e nao altera o valor unitário do item.</div>
 <div class="d-flex justify-content-end gap-2">
 <button type="button" class="btn btn-light rounded-pill" @click="showBatchRestock = false">Cancelar</button>
 <button class="btn btn-primary rounded-pill" @click="submitBatchRestock">
 <i class="fa-solid fa-boxes-stacked me-2"></i>
 Confirmar reposição em lote
 </button>
 </div>
 </div>
 </ModalDialog>

 <ModalDialog v-model="showBatchCreate" title="Cadastro em massa" :eyebrow="eyebrow" size="full">
 <div class="d-grid gap-3">
 <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
 <div class="small">Cadastre vários itens novos do estoque de uma vez, no mesmo padrão operacional da reposição em lote.</div>
 <div class="d-flex gap-3 flex-wrap align-items-center">
 <label class="form-check form-switch mb-0">
 <input class="form-check-input" type="checkbox" @change="(e: any) => batchCreateRows.forEach(r => r.generateFinanceEntry = e.target.checked)" />
 <span class="form-check-label small fw-semibold">Lançar financeiro</span>
 </label>
 <button type="button" class="btn btn-light rounded-pill" @click="addBatchCreateRow">
 <i class="fa-solid fa-plus me-2"></i>
 Adicionar linha
 </button>
 </div>
 </div>
 <div class="table-responsive">
 <table class="table align-middle">
 <thead>
 <tr>
 <th style="width: 190px;">SKU</th>
 <th style="min-width: 320px;">Nome</th>
 <th style="width: 220px;">Marca</th>
 <th style="width: 220px;">Categoria</th>
 <th style="width: 220px;">Subcategoria</th>
 <th style="width: 190px;">Condição</th>
 <th style="width: 120px;">Qtd</th>
 <th style="width: 120px;">Mín</th>
 <th style="width: 160px;">Custo</th>
 <th style="width: 160px;">Venda</th>
 <th style="width: 120px;">Finan?</th>
 <th style="width: 260px;">Conta</th>
 <th style="width: 80px;"></th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="(item, index) in batchCreateRows" :key="`batch-create-${index}`">
 <td><input v-model="item.sku" class="form-control form-control-sm rounded-4" placeholder="Opcional" /></td>
 <td><input v-model="item.name" class="form-control form-control-sm rounded-4" placeholder="Nome do item" /></td>
 <td><input v-model="item.brand" class="form-control form-control-sm rounded-4" placeholder="Marca" /></td>
 <td>
 <select v-model="item.category" class="form-select form-select-sm rounded-4">
 <option value="">Selecione</option>
 <option v-for="category in session.meta?.catalogCategories || []" :key="category" :value="category">{{ category }}</option>
 </select>
 </td>
 <td>
 <select v-if="subcategoryOptionsFor(item.category).length" v-model="item.subcategory" class="form-select form-select-sm rounded-4">
 <option value="">Selecione</option>
 <option v-for="subcategory in subcategoryOptionsFor(item.category)" :key="subcategory" :value="subcategory">{{ subcategory }}</option>
 </select>
 <input v-else v-model="item.subcategory" class="form-control form-control-sm rounded-4" placeholder="Opcional" />
 </td>
 <td>
 <select v-model="item.itemCondition" class="form-select form-select-sm rounded-4">
 <option v-for="condition in session.meta?.itemConditions || []" :key="condition.code" :value="condition.code">{{ condition.label }}</option>
 </select>
 </td>
 <td><input v-model.number="item.stockQuantity" type="number" min="0" class="form-control form-control-sm rounded-4" /></td>
 <td><input v-model.number="item.minStock" type="number" min="0" class="form-control form-control-sm rounded-4" /></td>
 <td><input v-model.number="item.costAmount" type="number" min="0" step="0.01" class="form-control form-control-sm rounded-4" /></td>
 <td><input v-model.number="item.priceAmount" type="number" min="0" step="0.01" class="form-control form-control-sm rounded-4" /></td>
 <td>
 <div class="form-check form-switch">
 <input v-model="item.generateFinanceEntry" class="form-check-input" type="checkbox" />
 </div>
 </td>
 <td>
 <select v-model.number="item.cashAccountId" class="form-select form-select-sm rounded-4" :disabled="!item.generateFinanceEntry">
 <option v-for="account in cashAccountOptions" :key="account.code" :value="Number(account.id)">{{ account.label }}</option>
 </select>
 </td>
 <td class="text-end">
 <button type="button" class="btn btn-sm btn-outline-danger rounded-pill" :disabled="batchCreateRows.length === 1" @click="removeBatchCreateRow(index)">
 <i class="fa-solid fa-trash"></i>
 </button>
 </td>
 </tr>
 </tbody>
 </table>
 </div>
 <div class="panel-card bg-light border-0 py-3 px-3 mb-0">
 <div class="d-flex flex-wrap justify-content-between gap-3">
 <div class="small">Ative o financeiro só quando a entrada inicial representar compra real. Migração de estoque já existente não precisa afetar o caixa.</div>
 <div class="fw-semibold">Despesa prevista: {{ currency(batchCreateEstimatedExpense) }}</div>
 </div>
 </div>
 <div class="d-flex justify-content-end gap-2">
 <button type="button" class="btn btn-light rounded-pill" @click="closeBatchCreate">Cancelar</button>
 <button class="btn btn-primary rounded-pill" @click="submitBatchCreate">
 <i class="fa-solid fa-boxes-stacked me-2"></i>
 Confirmar cadastro em massa
 </button>
 </div>
 </div>
 </ModalDialog>
 </AppShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import AppShell from "./AppShell.vue";
import BarcodeField from "./BarcodeField.vue";
import DataTable from "./DataTable.vue";
import FilterDrawer from "./FilterDrawer.vue";
import MetricCard from "./MetricCard.vue";
import ModalDialog from "./ModalDialog.vue";
import SelectionActionBar from "./SelectionActionBar.vue";
import { api } from "../services/api";
import { currency, labelFor, toneFor } from "../services/format";
import { notifyError, notifySuccess } from "../services/ui";
import { useSessionStore } from "../stores/session";
import type { CatalogDeleteResult, CatalogItem, CatalogItemDetail, StockReplenishment } from "../services/types";

const props = defineProps<{
 title: string;
 subtitle: string;
 eyebrow: string;
 tableTitle: string;
 createLabel: string;
 storeInventoryOnly?: boolean;
}>();

const session = useSessionStore();
const catalogTable = ref<any>(null);
const items = ref<CatalogItem[]>([]);
const selectedItem = ref<CatalogItemDetail | null>(null);
const selectedRows = ref<CatalogItem[]>([]);
const showDetail = ref(false);
const showForm = ref(false);
const showRestock = ref(false);
const showBatchRestock = ref(false);
const showBatchCreate = ref(false);
const restockTarget = ref<CatalogItemDetail | null>(null);
const revertingReplenishmentId = ref(0);
const cashAccountOptions = ref<Array<{ id: number; code: string; label: string }>>([]);
const batchRestockRows = ref<Array<{ id: number; name: string; quantity: number; costAmount: number; priceAmount: number; additionalCost: number; notes: string; generateFinanceEntry?: boolean; cashAccountId?: number }>>([]);
const batchCreateRows = ref<Array<{ sku: string; name: string; brand: string; category: string; subcategory: string; itemCondition: string; stockQuantity: number; minStock: number; costAmount: number; priceAmount: number; generateFinanceEntry: boolean; cashAccountId: number }>>([]);

const filters = reactive({
 search: "",
 category: "",
 itemCondition: "",
 lowStockOnly: false,
 activeOnly: false,
 onlyStoreInventory: !!props.storeInventoryOnly
});

const form = reactive({
 id: 0,
 sku: "",
 name: "",
 brand: "",
 description: "",
 category: "",
 subcategory: "",
 itemCondition: "NOVA",
 stockQuantity: 0,
 minStock: 0,
 costAmount: 0,
 priceAmount: 0,
 active: true,
 locationType: props.storeInventoryOnly ? "INVENTARIO" : "ESTOQUE",
 generateFinanceEntry: false,
 cashAccountId: 0
});

const restockForm = reactive({
 quantity: 1,
 costAmount: 0,
 priceAmount: 0,
 additionalCost: 0,
 notes: "",
 generateFinanceEntry: false,
 cashAccountId: 0
});

const stockValue = computed(() => items.value.reduce((sum, item) => sum + Number(item.stock_value || 0), 0));
const lowStockCount = computed(() => items.value.filter((item) => Number(item.stock_quantity) <= Number(item.min_stock)).length);
const averageProfit = computed(() => items.value.length ? items.value.reduce((sum, item) => sum + Number(item.profit_percent || 0), 0) / items.value.length : 0);
const averageProfitLabel = computed(() => percentLabel(averageProfit.value));
const subcategoryOptions = computed(() => session.meta?.catalogSubcategoriesMap?.[form.category] || []);
const showStockSetupFields = computed(() => form.locationType === "ESTOQUE");
const selectedIds = computed(() => selectedRows.value.map((item) => Number(item.id)).filter(Boolean));
const selectedCount = computed(() => selectedIds.value.length);
const defaultCashAccountId = computed(() => Number(cashAccountOptions.value[0]?.id || 0));
const batchCreateEstimatedExpense = computed(() => batchCreateRows.value.reduce((sum, item) => sum + (item.generateFinanceEntry ? (Number(item.stockQuantity || 0) * Number(item.costAmount || 0)) : 0), 0));

const columns = [
 {
 title: "Ações",
 field: "actions",
 hozAlign: "center",
 headerSort: false,
 cssClass: "action-cell",
 width: 92,
 formatter: () => `
 <div class="action-menu" data-row-action="true">
 <details class="action-menu__details" data-row-action="true">
 <summary class="action-menu__toggle" data-row-action="true"><i class="fa-solid fa-ellipsis-vertical" data-row-action="true"></i></summary>
 <div class="action-menu__list" data-row-action="true">
 <button class="action-menu__item action-view" data-row-action="true"><i class="fa-solid fa-eye me-2"></i>Ver</button>
 <button class="action-menu__item action-restock" data-row-action="true"><i class="fa-solid fa-box-open me-2"></i>Reposição</button>
 <button class="action-menu__item action-edit" data-row-action="true"><i class="fa-solid fa-pen me-2"></i>Editar</button>
 <button class="action-menu__item action-delete" data-row-action="true"><i class="fa-solid fa-trash me-2"></i>Excluir</button>
 </div>
 </details>
 </div>
 `,
 cellClick: async (event: MouseEvent, cell: any) => {
 const target = event.target as HTMLElement | null;
 const rowData = cell.getRow().getData() as CatalogItem;
 event.stopPropagation();
 if (target?.closest(".action-view")) {
 closeActionMenu(target);
 await openDetail(rowData);
 return;
 }
 if (target?.closest(".action-restock")) {
 closeActionMenu(target);
 await openRestock(rowData);
 return;
 }
 if (target?.closest(".action-edit")) {
 closeActionMenu(target);
 await openEditById(Number(rowData.id));
 return;
 }
 if (target?.closest(".action-delete")) {
 closeActionMenu(target);
 await removeRow(rowData);
 }
 }
 },
 {
 title: "SKU / código de barras",
 field: "sku",
 minWidth: 180,
 formatter: (cell: any) => String(cell.getValue() || "-")
 },
 {
 title: "Nome / descrição",
 field: "name",
 minWidth: 320,
 cssClass: "cell-wrap",
 variableHeight: true,
 formatter: (cell: any) => {
 const row = cell.getRow().getData() as CatalogItem;
 const brand = row.brand ? `<div class="small">${row.brand}</div>` : "";
 const description = row.description ? `<div class="small mt-1">${row.description}</div>` : "";
 return `<div><div class="fw-semibold">${row.name}</div>${brand}${description}</div>`;
 }
 },
 { title: "Qnt mínima", field: "min_stock", hozAlign: "center", minWidth: 110 },
 { title: "Qnt atual", field: "stock_quantity", hozAlign: "center", minWidth: 110 },
 { title: "Preço custo", field: "cost_amount", hozAlign: "right", minWidth: 140, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Preço venda", field: "price_amount", hozAlign: "right", minWidth: 140, formatter: (cell: any) => currency(cell.getValue()) }
];
const catalogCardFields = [
 {
 key: "sku",
 label: "SKU / código",
 value: (row: Record<string, unknown>) => String(row.sku || "Sem SKU")
 },
 {
 key: "stock_quantity",
 label: "Qnt atual",
 value: (row: Record<string, unknown>) => String(row.stock_quantity || 0)
 },
 {
 key: "min_stock",
 label: "Qnt mínima",
 value: (row: Record<string, unknown>) => String(row.min_stock || 0)
 },
 {
 key: "cost_amount",
 label: "Preço custo",
 value: (row: Record<string, unknown>) => currency(row.cost_amount)
 },
 {
 key: "price_amount",
 label: "Preço venda",
 value: (row: Record<string, unknown>) => currency(row.price_amount)
 },
 {
 key: "description",
 label: "Descrição",
 value: (row: Record<string, unknown>) => String(row.description || "-"),
 fullWidth: true
 }
];

function catalogCardBadge(row: Record<string, unknown>) {
 return {
 label: conditionLabel(String(row.item_condition || "")),
 tone: conditionTone(String(row.item_condition || ""))
 };
}

const catalogCardActions = [
 {
 key: "view",
 label: "Ver",
 icon: "fa-solid fa-eye",
 handler: async (row: Record<string, unknown>) => {
 await openDetail(row);
 }
 },
 {
 key: "restock",
 label: "Reposição",
 icon: "fa-solid fa-box-open",
 handler: async (row: Record<string, unknown>) => {
 await openRestock(row as Partial<CatalogItem>);
 }
 },
 {
 key: "edit",
 label: "Editar",
 icon: "fa-solid fa-pen",
 handler: async (row: Record<string, unknown>) => {
 await openEditById(Number(row.id));
 }
 },
 {
 key: "delete",
 label: "Excluir",
 icon: "fa-solid fa-trash",
 tone: "danger" as const,
 handler: async (row: Record<string, unknown>) => {
 await removeRow(row);
 }
 }
];

function closeActionMenu(target: HTMLElement | null) {
 target?.closest("details")?.removeAttribute("open");
}

function conditionLabel(code: string) {
 return labelFor(code, session.meta?.itemConditions || []);
}

function conditionTone(code: string) {
 if (code === "USADA") {
 return "warning";
 }
 if (code === "SEMINOVA") {
 return "info";
 }
 return "success";
}

function orderStatusLabel(code: string) {
 return labelFor(code, session.meta?.orderStatuses || []);
}

function orderStatusTone(code: string) {
 return toneFor(code, session.meta?.orderStatuses || []);
}

function approvalStatusLabel(code: string) {
 return labelFor(code, session.meta?.approvalStatuses || []);
}

function approvalStatusTone(code: string) {
 return toneFor(code, session.meta?.approvalStatuses || []);
}

function locationTypeLabel(code: string) {
 return String(code || "ESTOQUE") === "INVENTARIO" ? "Item do inventário" : "Item do estoque";
}

function stockHealthTone(code: string) {
 if (code === "SEM_ESTOQUE") {
 return "danger";
 }
 if (code === "BAIXO") {
 return "warning";
 }
 return "success";
}

function dateLabel(value: string | null | undefined) {
 if (!value) {
 return "Não informado";
 }
 const raw = String(value);
 const dateOnly = raw.slice(0, 10);
 if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
 const [year, month, day] = dateOnly.split("-");
 return `${day}/${month}/${year}`;
 }
 const parsed = new Date(raw);
 if (Number.isNaN(parsed.getTime())) {
 return raw;
 }
 return parsed.toLocaleString("pt-BR");
}

function percentLabel(value: number | null | undefined) {
 return `${Number(value || 0).toFixed(2)}%`;
}

async function loadCashAccounts() {
 try {
 const response = await api.storeCashAccounts();
 cashAccountOptions.value = (response.data || [])
 .filter((account) => Number(account.active) === 1)
 .map((account) => ({
 id: Number(account.id),
 code: String(account.code || ""),
 label: String(account.name || account.code || "Conta")
 }));
 if (!form.cashAccountId) {
 form.cashAccountId = defaultCashAccountId.value;
 }
 if (!restockForm.cashAccountId) {
 restockForm.cashAccountId = defaultCashAccountId.value;
 }
 } catch (error) {
 cashAccountOptions.value = [];
 await notifyError(error);
 }
}

async function loadItems() {
 try {
 const response = await api.catalog({
 search: filters.search,
 category: filters.category,
 itemCondition: filters.itemCondition,
 lowStockOnly: filters.lowStockOnly,
 activeOnly: filters.activeOnly,
 storeInventoryOnly: props.storeInventoryOnly || filters.onlyStoreInventory
 });
 items.value = response.data;
 await nextTick();
 clearSelection();
 } catch (error) {
 await notifyError(error);
 }
}

function clearFilters() {
 Object.assign(filters, {
 search: "",
 category: "",
 itemCondition: "",
 lowStockOnly: false,
 activeOnly: false,
 onlyStoreInventory: !!props.storeInventoryOnly
 });
 void loadItems();
}

function resetForm() {
 Object.assign(form, {
 id: 0,
 sku: "",
 name: "",
 brand: "",
 description: "",
 category: "",
 subcategory: "",
 itemCondition: "NOVA",
 stockQuantity: 0,
 minStock: 0,
 costAmount: 0,
 priceAmount: 0,
 active: true,
 locationType: props.storeInventoryOnly ? "INVENTARIO" : "ESTOQUE",
 generateFinanceEntry: false,
 cashAccountId: defaultCashAccountId.value
 });
}

function resetRestockForm() {
 Object.assign(restockForm, {
 quantity: 1,
 costAmount: 0,
 priceAmount: 0,
 additionalCost: 0,
 notes: "",
 generateFinanceEntry: false,
 cashAccountId: defaultCashAccountId.value
 });
}

function createBatchCreateRow() {
 return {
 sku: "",
 name: "",
 brand: "",
 category: "",
 subcategory: "",
 itemCondition: "NOVA",
 stockQuantity: 0,
 minStock: 0,
 costAmount: 0,
 priceAmount: 0,
 generateFinanceEntry: false,
 cashAccountId: defaultCashAccountId.value
 };
}

function resetBatchCreateRows() {
 batchCreateRows.value = [createBatchCreateRow()];
}

function subcategoryOptionsFor(category: string) {
 return session.meta?.catalogSubcategoriesMap?.[category] || [];
}

function openBatchCreate() {
 resetBatchCreateRows();
 showBatchCreate.value = true;
}

function closeBatchCreate() {
 showBatchCreate.value = false;
 resetBatchCreateRows();
}

function addBatchCreateRow() {
 batchCreateRows.value.push(createBatchCreateRow());
}

function removeBatchCreateRow(index: number) {
 if (batchCreateRows.value.length === 1) {
 return;
 }
 batchCreateRows.value.splice(index, 1);
}

function openBatchRestock() {
 if (!selectedRows.value.length) {
 return;
 }
 const defaultAccountId = defaultCashAccountId.value;
 batchRestockRows.value = selectedRows.value.map((item) => ({
 id: Number(item.id),
 name: String(item.name || "Item"),
 quantity: 1,
 costAmount: Number(item.cost_amount || 0),
 priceAmount: Number(item.price_amount || 0),
 additionalCost: 0,
 notes: "",
 generateFinanceEntry: false,
 cashAccountId: defaultAccountId
 }));
 showBatchRestock.value = true;
}

function openCreate() {
 resetForm();
 showForm.value = true;
}

function handleSelectionChange(rows: Record<string, unknown>[]) {
 selectedRows.value = rows as CatalogItem[];
}

function selectAllItems() {
 catalogTable.value?.selectAllRows?.();
}

function clearSelection() {
 selectedRows.value = [];
 catalogTable.value?.clearSelection?.();
}

async function openDetail(row: Record<string, unknown>) {
 try {
 const response = await api.catalogItem(Number(row.id));
 selectedItem.value = response.data;
 showDetail.value = true;
 } catch (error) {
 await notifyError(error);
 }
}

async function openEditById(itemId: number) {
 try {
 const response = await api.catalogItem(itemId);
 openEdit(response.data);
 } catch (error) {
 await notifyError(error);
 }
}

function openEdit(row: Partial<CatalogItem>) {
 showDetail.value = false;
 Object.assign(form, {
 id: Number(row.id || 0),
 sku: row.sku || "",
 name: row.name || "",
 brand: row.brand || "",
 description: row.description || "",
 category: row.category || "",
 subcategory: row.subcategory || "",
 itemCondition: row.item_condition || "NOVA",
 stockQuantity: Number(row.stock_quantity || 0),
 minStock: Number(row.min_stock || 0),
 costAmount: Number(row.cost_amount || 0),
 priceAmount: Number(row.price_amount || 0),
 active: Boolean(row.active),
 locationType: String(row.location_type || (row.is_store_inventory ? "INVENTARIO" : "ESTOQUE"))
 });
 showForm.value = true;
}

async function openRestock(row: Partial<CatalogItem>) {
 try {
 const response = await api.catalogItem(Number(row.id));
 restockTarget.value = response.data;
 Object.assign(restockForm, {
 quantity: 1,
 costAmount: Number(response.data.cost_amount || 0),
 priceAmount: Number(response.data.price_amount || 0),
 additionalCost: 0,
 notes: ""
 });
 showRestock.value = true;
 } catch (error) {
 await notifyError(error);
 }
}

function closeRestock() {
 showRestock.value = false;
 restockTarget.value = null;
 resetRestockForm();
}

async function submitRestock() {
 if (!restockTarget.value) {
 return;
 }

 try {
 const response = await api.replenishCatalog(restockTarget.value.id, {
 quantity: restockForm.quantity,
 costAmount: restockForm.costAmount,
 priceAmount: restockForm.priceAmount,
 additionalCost: restockForm.additionalCost,
 notes: restockForm.notes,
 generateFinanceEntry: restockForm.generateFinanceEntry,
 cashAccountId: restockForm.cashAccountId
 });
 restockTarget.value = response.data;
 selectedItem.value = response.data;
 showRestock.value = false;
 resetRestockForm();
 await loadItems();
 await notifySuccess("Reposição registrada", "Estoque e preços correntes foram atualizados.");
 } catch (error) {
 await notifyError(error);
 }
}


async function revertReplenishment(entry: StockReplenishment, index: number) {
 if (index !== 0) {
 await notifyError(new Error('Apenas a reposição mais recente pode ser desfeita.'));
 return;
 }
 const confirmed = window.confirm('Desfazer esta reposição vai remover o estoque adicionado e também apagar os lançamentos do financeiro e do caixa vinculados. Continuar?');
 if (!confirmed) {
 return;
 }

 try {
 revertingReplenishmentId.value = Number(entry.id || 0);
 const response = await api.revertCatalogReplenishment(Number(entry.id));
 selectedItem.value = response.data;
 if (restockTarget.value && Number(restockTarget.value.id) === Number(response.data.id)) {
 restockTarget.value = response.data;
 }
 await loadItems();
 await notifySuccess('Reposição desfeita', 'Estoque, financeiro e saldo foram revertidos.');
 } catch (error) {
 await notifyError(error);
 } finally {
 revertingReplenishmentId.value = 0;
 }
}

async function submitBatchRestock() {
 const payload = batchRestockRows.value
 .map((item) => ({
 id: Number(item.id),
 quantity: Number(item.quantity || 0),
 costAmount: Number(item.costAmount || 0),
 priceAmount: Number(item.priceAmount || 0),
 additionalCost: Number(item.additionalCost || 0),
 notes: String(item.notes || ""),
 generateFinanceEntry: Boolean(item.generateFinanceEntry),
 cashAccountId: Number(item.cashAccountId || 0)
 }))
 .filter((item) => item.id > 0);

 if (!payload.length) {
 return;
 }

 try {
 await api.replenishCatalogBatch(payload);
 showBatchRestock.value = false;
 batchRestockRows.value = [];
 await loadItems();
 clearSelection();
 await notifySuccess("Reposição em lote registrada", "Os itens selecionados foram atualizados de uma vez.");
 } catch (error) {
 await notifyError(error);
 }
}

async function submitBatchCreate() {
 const invalidIndex = batchCreateRows.value.findIndex((item) => !String(item.name || "").trim() || !String(item.category || "").trim());
 if (invalidIndex >= 0) {
 await notifyError(new Error(`Linha ${invalidIndex + 1}: nome e categoria são obrigatórios.`));
 return;
 }

 const payload = batchCreateRows.value.map((item) => ({
 sku: String(item.sku || "").trim(),
 name: String(item.name || "").trim(),
 brand: String(item.brand || "").trim(),
 category: String(item.category || "").trim(),
 subcategory: String(item.subcategory || "").trim(),
 itemCondition: String(item.itemCondition || "NOVA"),
 stockQuantity: Number(item.stockQuantity || 0),
 minStock: Number(item.minStock || 0),
 costAmount: Number(item.costAmount || 0),
 priceAmount: Number(item.priceAmount || 0),
 generateFinanceEntry: Boolean(item.generateFinanceEntry),
 cashAccountId: Number(item.cashAccountId || 0),
 locationType: "ESTOQUE"
 }));

 try {
 await api.saveCatalogBatch(payload);
 closeBatchCreate();
 await loadItems();
 await notifySuccess("Cadastro em massa concluído", `${payload.length} item(ns) novo(s) foram adicionados ao estoque.`);
 } catch (error) {
 await notifyError(error);
 }
}

async function saveItem() {
 try {
 const response = await api.saveCatalog({
 ...form,
 isStoreInventory: form.locationType === "INVENTARIO",
 generateFinanceEntry: form.generateFinanceEntry,
 cashAccountId: form.cashAccountId
 });
 showForm.value = false;
 await loadItems();
 selectedItem.value = response.data.id ? await api.catalogItem(response.data.id).then((payload) => payload.data) : null;
 await notifySuccess("Item salvo", "Cadastro, estoque e visao operacional atualizados.");
 } catch (error) {
 await notifyError(error);
 }
}

function buildDeleteSummary(result: CatalogDeleteResult) {
 const deletedText = result.deletedCount ? `${result.deletedCount} item(ns) excluido(s)` : "Nenhum item foi excluido";
 const archivedText = result.archivedCount
 ? `${result.archivedCount} item(ns) arquivado(s) por historico, preservando OS e PDV`
 : "";
 const preview = result.blocked
 .slice(0, 3)
 .map((item) => `${item.name} (${item.linkedOrders} OS)`)
 .join(", ");
 const more = result.blockedCount > 3 ? ` e mais ${result.blockedCount - 3}` : "";
 const blockedText = result.blockedCount ? `${result.blockedCount} item(ns) ainda bloqueado(s): ${preview}${more}` : "";
 return [deletedText, archivedText, blockedText].filter(Boolean).join(". ") + ".";
}

async function showDeleteResult(result: CatalogDeleteResult) {
 const title = result.blockedCount
 ? result.deletedCount || result.archivedCount
 ? "Exclusao parcial concluida"
 : "Itens ainda bloqueados"
 : result.archivedCount
 ? "Itens arquivados"
 : "Itens excluidos";
 const icon = result.blockedCount ? (result.deletedCount || result.archivedCount ? "warning" : "info") : "success";
 const text = buildDeleteSummary(result);
 if (window.Swal) {
 await window.Swal.fire({ icon, title, text });
 return;
 }
 if (result.blockedCount) {
 window.alert(text);
 return;
 }
 await notifySuccess(title, text);
}

async function removeItems(ids: number[], label: string) {
 if (!ids.length) {
 return;
 }

 const confirmed = window.Swal
 ? await window.Swal.fire({
 icon: "warning",
 title: ids.length === 1 ? `Excluir ${label}?` : "Excluir itens selecionados?",
 text:
 ids.length === 1
 ? `Isso vai excluir ${label}. Se ele ja tiver historico, sera arquivado e saira da lista sem apagar OS ou PDV.`
 : `Isso vai tentar excluir ${ids.length} item(ns). Os que ja tiverem historico serao arquivados e sumirao da lista.`,
 showCancelButton: true,
 confirmButtonText: ids.length === 1 ? "Excluir item" : "Excluir selecionados",
 cancelButtonText: "Cancelar",
 confirmButtonColor: "#d95165"
 })
 : { isConfirmed: window.confirm(`Excluir ${label}?`) };

 if (!confirmed.isConfirmed) {
 return;
 }

 try {
 const result = ids.length === 1 ? await api.deleteCatalog(ids[0]) : await api.deleteCatalogBatch(ids);
 const removedIds = [...result.deleted, ...(result.archived || [])].map((item) => Number(item.id));
 if (selectedItem.value && ids.includes(Number(selectedItem.value.id)) && removedIds.includes(Number(selectedItem.value?.id))) {
 selectedItem.value = null;
 showDetail.value = false;
 }
 if (ids.includes(Number(form.id)) && removedIds.includes(Number(form.id))) {
 resetForm();
 showForm.value = false;
 }
 await loadItems();
 await showDeleteResult(result);
 } catch (error) {
 await notifyError(error);
 }
}

async function removeItem(item: Pick<CatalogItem, "id" | "name">) {
 await removeItems([Number(item.id)], item.name);
}

async function removeRow(row: Record<string, unknown>) {
 await removeItem({
 id: Number(row.id),
 name: String(row.name || "item")
 });
}

async function removeSelectedItems() {
 await removeItems(selectedIds.value, `${selectedCount.value} item(ns)`);
}

watch(
 () => [filters.lowStockOnly, filters.activeOnly, filters.onlyStoreInventory],
 () => {
 void loadItems();
 }
);

watch(
 () => form.category,
 () => {
 if (!subcategoryOptions.value.includes(form.subcategory)) {
 form.subcategory = "";
 }
 if (props.storeInventoryOnly) {
 form.locationType = "INVENTARIO";
 }
 }
);

onMounted(async () => {
 await loadCashAccounts();
 resetBatchCreateRows();
 await loadItems();
});
</script>

