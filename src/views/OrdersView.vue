<template>
 <AppShell title="Ordens de serviço" subtitle="Recepção, diagnóstico, aprovação, peças e fechamento em um fluxo guiado de hábito operacional.">
 <template #actions>
 <FilterDrawer title="Filtros da operação" @apply="loadOrders" @clear="clearFilters">
 <div class="d-grid gap-3">
 <div>
 <label class="form-label fw-semibold">Buscar</label>
 <input v-model="filters.search" class="form-control rounded-4" placeholder="Código, cliente, defeito ou equipamento" />
 </div>
 <div class="row g-3">
 <div class="col-md-6">
 <label class="form-label fw-semibold">Status</label>
 <select v-model="filters.orderStatus" class="form-select rounded-4">
 <option value="">Todos</option>
 <option v-for="item in session.meta?.orderStatuses || []" :key="item.code" :value="item.code">{{ item.label }}</option>
 </select>
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold">Aprovação</label>
 <select v-model="filters.approvalStatus" class="form-select rounded-4">
 <option value="">Todas</option>
 <option v-for="item in session.meta?.approvalStatuses || []" :key="item.code" :value="item.code">{{ item.label }}</option>
 </select>
 </div>
 </div>

 </div>
 </FilterDrawer>
 <button class="btn btn-primary rounded-pill" @click="openCreate">
 <i class="fa-solid fa-file-circle-plus me-2"></i>
 Nova OS
 </button>
 </template>

 <div class="row g-4 mb-4">
 <div class="col-md-4">
 <MetricCard title="OS em aberto" :value="openOrders" hint="Ordens em diagnóstico, execução ou aguardando entrega." icon="fa-solid fa-folder-open" tone="warning" />
 </div>
 <div class="col-md-4">
 <MetricCard title="Aguardando aprovação" :value="pendingApproval" hint="Ordens travadas aguardando ok do cliente." icon="fa-solid fa-hourglass-half" tone="info" />
 </div>
 <div class="col-md-4">
 <MetricCard title="Total em OS" :value="currency(totalValue)" hint="Valor consolidado das ordens visíveis no filtro atual." icon="fa-solid fa-money-bill-trend-up" tone="success" />
 </div>
 </div>

 <DataTable
 ref="ordersTable"
 title="Fila de atendimento"
 eyebrow="Operação"
 :rows="orders"
 :columns="columns"
 :allow-csv="true"
 :allow-print="true"
 :selectable-rows="true"
 @selection-change="handleSelectionChange"
 @row-click="openDetail"
 />

 <SelectionActionBar class="mt-4" :selected-count="selectedRows.length" item-label="OS" @select-all="selectAllOrders" @clear="clearOrderSelection">
 <button class="btn btn-danger rounded-pill" @click="removeSelectedOrders">
 <i class="fa-solid fa-trash me-2"></i>
 Excluir selecionadas
 </button>
 </SelectionActionBar>

 <ModalDialog v-model="showDetail" title="Perfil completo da OS" eyebrow="CRM operacional" size="xl">
 <div v-if="selectedOrder" class="d-grid gap-4">
 <div class="hero-banner">
 <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
 <div>
 <div class="small opacity-75 mb-2">OS ativa</div>
 <h3 class="h2 fw-bold mb-1">{{ selectedOrder.code }}</h3>
 <div class="text-white-50">{{ selectedOrder.client_name }} | {{ selectedOrder.equipment }}</div>
 </div>
 <div class="table-actions">
 <button class="btn btn-light rounded-pill" @click="openPrint(selectedOrder.id)">
 <i class="fa-solid fa-print me-2"></i>
 Imprimir
 </button>
 <button class="btn btn-outline-light rounded-pill" @click="openEditById(selectedOrder.id)">
 <i class="fa-solid fa-pen me-2"></i>
 Editar
 </button>
 <button class="btn btn-outline-light rounded-pill" @click="removeOrder(selectedOrder)">
 <i class="fa-solid fa-trash me-2"></i>
 Excluir
 </button>
 </div>
 </div>
 </div>

 <div class="row g-4">
 <div class="col-lg-4">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Cliente e contato</div>
 <div class="mb-2"><strong>Cliente:</strong> {{ selectedOrder.client_name }}</div>
 <div class="mb-2"><strong>Telefone:</strong> <PhoneLink :phone="selectedOrder.client_phone || selectedOrder.phone_snapshot" /></div>
 <div class="mb-2"><strong>Email:</strong> {{ selectedOrder.client_email || 'Não informado' }}</div>
 <div class="mb-2"><strong>Documento:</strong> {{ selectedOrder.client_document || 'Não informado' }}</div>
 <div class="mb-2"><strong>Endereço:</strong> {{ selectedOrder.client_address || 'Não informado' }}</div>
 </div>
 </div>
 <div class="col-lg-4">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Aparelho e diagnóstico</div>
 <div class="mb-2"><strong>Equipamento:</strong> {{ selectedOrder.equipment }}</div>
 <div class="mb-2"><strong>Defeito:</strong> {{ selectedOrder.defect }}</div>
 <div class="mb-2"><strong>Acessórios:</strong> {{ selectedOrder.accessories?.length ? selectedOrder.accessories.join(', ') : 'Nenhum acessório marcado' }}</div>
 <div v-if="selectedOrder.accessories_other" class="mb-2"><strong>Outros acessórios:</strong> {{ selectedOrder.accessories_other }}</div>
 <div class="mb-2"><strong>Extras:</strong> {{ selectedOrder.extras || 'Sem extras' }}</div>
 <div class="mb-2"><strong>Observacoes:</strong> {{ selectedOrder.clean_notes || 'Sem observacoes' }}</div>
<div class="mb-2"><strong>Previsão:</strong> {{ dueDateLabel(selectedOrder.due_date) }}</div>
 </div>
 </div>
 <div class="col-lg-4">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Status e valores</div>
 <div class="mb-2"><strong>Status:</strong> {{ orderStatusLabel(selectedOrder.order_status) }}</div>
 <div class="mb-2"><strong>Aprovação:</strong> {{ approvalStatusLabel(selectedOrder.approval_status) }}</div>
<div class="mb-2"><strong>Orçamento:</strong> {{ quoteLabel(selectedOrder.quote_amount) }}</div>
 <div class="mb-2"><strong>Teto pre-aprovado:</strong> {{ currency(selectedOrder.pre_approved_limit) }}</div>
 <div class="mb-2"><strong>Valor real:</strong> {{ currency(selectedOrder.actual_amount) }}</div>
 <div class="mb-2"><strong>Serviços:</strong> {{ currency(selectedOrder.service_amount) }}</div>
 <div class="mb-2"><strong>Prazo previsto:</strong> {{ minutesLabel(selectedOrder.estimated_total_minutes || 0) }}</div>
 <div class="mb-2"><strong>Total:</strong> {{ currency(selectedOrder.total_amount) }}</div>
 </div>
 </div>
 </div>

 <div class="row g-4">
 <div class="col-lg-5">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Anexo principal</div>
 <div v-if="selectedOrder.photo_url && !isPdfUrl(selectedOrder.photo_url)" class="text-center">
 <img :src="selectedOrder.photo_url" alt="Foto da OS" class="img-fluid rounded-4 border" style="max-height: 300px; object-fit: contain;" />
 </div>
 <div v-else-if="selectedOrder.photo_url" class="d-grid gap-3 text-center">
 <div class="rounded-4 border border-secondary-subtle bg-light-subtle p-4">
 <i class="fa-solid fa-file-pdf fs-1 text-danger"></i>
 <div class="fw-semibold mt-3">Arquivo PDF anexado</div>
 <div class="small">Clique abaixo para abrir o documento completo.</div>
 </div>
 <a :href="selectedOrder.photo_url" target="_blank" rel="noreferrer" class="btn btn-outline-secondary rounded-pill">
 <i class="fa-solid fa-up-right-from-square me-2"></i>
 Abrir PDF
 </a>
 </div>
 <div v-else class="rounded-4 border border-secondary-subtle bg-light-subtle p-4 text-center">Nenhum anexo enviado.</div>
 </div>
 </div>
 <div class="col-lg-7">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Timeline da OS</div>
 <div v-if="selectedTimeline?.events?.length" class="timeline-list d-grid gap-3">
 <div v-for="event in selectedTimeline.events" :key="event.id" class="timeline-list__item">
 <div class="timeline-list__dot" :style="{ background: event.color }"></div>
 <div>
 <div class="fw-bold">{{ event.title }}</div>
 <div>{{ event.description }}</div>
 <div class="small mt-1">{{ event.event_date }} | {{ event.actor_name || 'Sistema' }}</div>
 </div>
 </div>
 </div>
 <div v-else>Nenhum evento adicional registrado para esta OS.</div>
 </div>
 </div>
 </div>

 <div class="panel-card">
 <div class="small fw-semibold mb-3">Itens vinculados</div>
 <div v-if="selectedOrder.items.length" class="table-responsive">
 <table class="table align-middle">
 <thead>
 <tr>
 <th>Produto</th>
 <th>SKU</th>
 <th>Categoria</th>
 <th>Qtd</th>
 <th>Preço</th>
 <th>Total</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="item in selectedOrder.items" :key="item.id || `${item.catalog_item_id}-${item.sku}`">
 <td>{{ item.item_name || 'Item' }}</td>
 <td>{{ item.sku || '-' }}</td>
 <td>{{ item.category || '-' }}</td>
 <td>{{ item.quantity }}</td>
 <td>{{ currency(item.unit_price || item.unitPrice) }}</td>
 <td>{{ currency((item.unit_price || item.unitPrice || 0) * Number(item.quantity || 1)) }}</td>
 </tr>
 </tbody>
 </table>
 </div>
 <div v-else>Nenhum item vinculado a esta OS.</div>
 </div>

 <div class="panel-card">
 <div class="small fw-semibold mb-3">Serviços vinculados</div>
 <div v-if="selectedOrder.services.length" class="table-responsive">
 <table class="table align-middle">
 <thead>
 <tr>
 <th>Serviço</th>
 <th>Descrição</th>
 <th>Qtd</th>
 <th>Prazo</th>
 <th>Preço</th>
 <th>Total</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="service in selectedOrder.services" :key="service.id || `${service.service_id}-${service.service_name}`">
 <td>{{ service.service_name || 'Serviço' }}</td>
 <td>{{ service.description || '-' }}</td>
 <td>{{ service.quantity }}</td>
 <td>{{ minutesLabel((service.estimated_minutes || 0) * Number(service.quantity || 1)) }}</td>
 <td>{{ currency(service.unit_price || service.unitPrice) }}</td>
 <td>{{ currency((service.unit_price || service.unitPrice || 0) * Number(service.quantity || 1)) }}</td>
 </tr>
 </tbody>
 </table>
 </div>
 <div v-else>Nenhum serviço vinculado a esta OS.</div>
 </div>
 </div>
 </ModalDialog>

 <ModalDialog v-model="showForm" :title="form.id ? 'Editar OS' : 'Nova OS'" eyebrow="Wizard operacional" size="xl">
 <div class="d-grid gap-4">
 <div class="hero-banner">
 <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
 <div>
 <div class="small opacity-75 mb-2">Código da OS</div>
 <h3 class="fw-bold mb-1">{{ form.code || 'Gerado automaticamente ao salvar' }}</h3>
 <div class="text-white-50">Padrão diário BE-AAAA-MM-DD-XX com estoque, serviços e aprovação integrados. Status atual: {{ orderStatusLabel(currentOrderStatus) }}.</div>
 </div>
 <button v-if="form.id" type="button" class="btn btn-light rounded-pill" @click="openPrint(form.id)">
 <i class="fa-solid fa-print me-2"></i>
 Imprimir OS
 </button>
 </div>
 </div>

 <OrderWizard :steps="steps" :active-step="activeStep" @back="goBack" @next="goNext" @save-draft="saveDraft" @finish="saveOrder">
 <div v-if="activeStep === 0" class="row g-4">
 <div class="col-12">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Recepção e cliente</div>
 <div class="btn-group w-100 mb-3" role="group">
 <input id="client-mode-existing" v-model="clientMode" type="radio" class="btn-check" name="client-mode" value="existing" />
 <label class="btn btn-outline-primary rounded-start-pill" for="client-mode-existing">Cliente cadastrado</label>
 <input id="client-mode-new" v-model="clientMode" type="radio" class="btn-check" name="client-mode" value="new" />
 <label class="btn btn-outline-primary rounded-end-pill" for="client-mode-new">Cadastrar no fluxo</label>
 </div>

 <div class="row g-3">
 <div v-if="clientMode === 'existing'" class="col-12">
 <ClientLookupField v-model="form.clientId" :clients="clients" required />
 </div>
<template v-else>
<div class="col-md-6">
<label class="form-label fw-semibold required-label">Nome do cliente</label>
<input v-model="newClient.name" class="form-control rounded-4" required />
</div>
<div class="col-md-6">
<label class="form-label fw-semibold required-label">Telefone do cliente</label>
<input v-model="newClient.phone" class="form-control rounded-4" required />
</div>
 <div class="col-12">
 <div class="panel-card bg-light-subtle border border-secondary-subtle">
 <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3">
 <label class="form-label fw-semibold mb-0" :class="{ 'required-label': !newClient.noAddress }">Endereço</label>
 <label class="form-check d-flex align-items-center gap-2 mb-0">
 <input v-model="newClient.noAddress" class="form-check-input" type="checkbox" />
 <span class="fw-semibold">Sem endereço</span>
 </label>
 </div>
 <input
  v-model="newClient.address"
  class="form-control rounded-4"
  :disabled="newClient.noAddress"
  :required="!newClient.noAddress"
  placeholder="Rua, número, bairro e referência"
 />
 </div>
 </div>
</template>
 <div class="col-12">
 <label class="form-label fw-semibold required-label">Equipamento</label>
 <input v-model="form.equipmentName" class="form-control rounded-4" required placeholder="Ex.: Notebook Dell Inspiron 15" />
 </div>
 <div class="col-12">
 <div class="d-flex justify-content-between align-items-center gap-3 mb-2">
 <label class="form-label fw-semibold mb-0">Acessórios recebidos</label>
 <span class="small">Marque pelo menos uma opção, inclusive sem acessórios quando for o caso.</span>
 </div>
 <div class="row g-2">
 <div v-for="accessory in ACCESSORY_OPTIONS" :key="accessory" class="col-sm-6 col-lg-4">
 <label class="form-check panel-card h-100 d-flex align-items-center gap-2 px-3 py-3">
 <input :checked="form.accessories.includes(accessory)" class="form-check-input mt-0" type="checkbox" :value="accessory" @change="handleAccessoryToggle(accessory, $event)" />
 <span class="fw-semibold">{{ accessory }}</span>
 </label>
 </div>
 </div>
 <div v-if="!form.accessories.length" class="small text-danger mt-2">Selecione pelo menos uma opção de acessórios recebidos.</div>
 </div>
 <div v-if="form.accessories.includes('Outro')" class="col-12">
 <label class="form-label fw-semibold">Outros acessórios</label>
 <input v-model="form.accessoriesOther" class="form-control rounded-4" placeholder="Descreva o acessório adicional" />
 </div>
 </div>
 </div>
 </div>
 </div>

 <div v-else-if="activeStep === 1" class="row g-4">
 <div class="col-lg-7">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Diagnóstico</div>
 <div class="row g-3">
 <div class="col-12">
 <label class="form-label fw-semibold required-label">Defeito relatado</label>
 <textarea v-model="form.defect" class="form-control rounded-4" rows="4" required></textarea>
 </div>
 <div class="col-12">
 <label class="form-label fw-semibold required-label">Estado físico do aparelho</label>
 <textarea v-model="form.extras" class="form-control rounded-4" rows="4" placeholder="Ex.: riscos, faltas, trincas, amassados e ausência de peças."></textarea>
 </div>
 </div>
 </div>
 </div>
 <div class="col-lg-5">
 <div class="panel-card h-100 d-grid gap-3">
 <div>
 <div class="small fw-semibold">Anexos da OS</div>
 <div class="small text-body-secondary">Use o mesmo campo para uma ou mais imagens ou PDFs.</div>
 </div>
 <MultiMediaCaptureField
  v-model="orderAttachments"
  label="Anexos"
  helper="Selecione uma ou mais imagens ou PDFs no mesmo campo."
  :existing-items="existingOrderAttachmentPreviews"
  :existing-count="existingOrderAttachmentPreviews.length"
  :max-per-selection="5"
  :max-total="15"
 />
 <div v-if="orderAttachments.length" class="d-grid gap-2">
  <div class="small fw-semibold">Arquivos adicionados neste cadastro</div>
  <div v-for="(attachment, index) in orderAttachments" :key="`${attachment.name}-${index}`" class="rounded-4 border border-secondary-subtle bg-light-subtle p-3">
   <div class="small text-truncate">{{ attachment.name || `Anexo ${index + 1}` }}</div>
  </div>
 </div>
 </div>
 </div>
 </div>

 <div v-else-if="activeStep === 2" class="row g-4">
<div class="col-lg-4">
<div class="panel-card h-100">
<div class="small fw-semibold mb-3">Orçamento automático</div>
<div class="row g-3">
<div class="col-12">
<label class="form-check form-switch d-flex align-items-center gap-2 mb-0">
<input v-model="form.withoutQuote" class="form-check-input" type="checkbox" />
<span class="fw-semibold">Sem orçamento</span>
</label>
</div>
<div class="col-12">
<label class="form-check form-switch d-flex align-items-center gap-2 mb-0">
<input v-model="form.preApproved" class="form-check-input" type="checkbox" />
<span class="fw-semibold">Pré-aprovado</span>
</label>
</div>
<div class="col-12">
<label class="form-check form-switch d-flex align-items-center gap-2 mb-0">
<input v-model="form.manualQuoteEnabled" class="form-check-input" type="checkbox" :disabled="form.withoutQuote" />
<span class="fw-semibold">Alterar orçamento manualmente</span>
</label>
</div>
<div class="col-12">
<label class="form-label fw-semibold">Orçamento atual</label>
<div class="form-control rounded-4 bg-body-tertiary">{{ quoteLabel(resolvedQuoteAmount) }}</div>
</div>
<div v-if="form.manualQuoteEnabled && !form.withoutQuote" class="col-12">
<label class="form-label fw-semibold">Orçamento manual</label>
<input v-model.number="form.manualQuoteAmount" type="number" min="0" step="0.01" class="form-control rounded-4" />
</div>
<div class="col-12">
<label class="form-check form-switch d-flex align-items-center gap-2 mb-0">
<input v-model="form.withoutDueDate" class="form-check-input" type="checkbox" />
<span class="fw-semibold">Sem previsão</span>
</label>
</div>
<div class="col-12">
<label class="form-check form-switch d-flex align-items-center gap-2 mb-0">
<input v-model="form.manualDueDateEnabled" class="form-check-input" type="checkbox" :disabled="form.withoutDueDate" />
<span class="fw-semibold">Alterar previsão manualmente</span>
</label>
</div>
<div class="col-12">
<label class="form-label fw-semibold">Previsão automática</label>
<div class="form-control rounded-4 bg-body-tertiary">{{ dateLabel(predictedDueDate) }}</div>
</div>
<div v-if="form.manualDueDateEnabled && !form.withoutDueDate" class="col-12">
<label class="form-label fw-semibold">Previsão final</label>
<input v-model="form.dueDate" type="date" class="form-control rounded-4" />
</div>
<div class="col-12">
<label class="form-label fw-semibold">Previsão atual</label>
<div class="form-control rounded-4 bg-body-tertiary">{{ dueDateLabel(resolvedDueDate) }}</div>
</div>
<div class="col-12">
<label class="form-label fw-semibold">Prazo base</label>
<div class="form-control rounded-4 bg-body-tertiary">{{ minutesLabel(estimatedServiceMinutes) }}</div>
</div>
 </div>
 </div>
 </div>
 <div class="col-lg-8 d-grid gap-4">
 <div class="panel-card h-100">
 <div class="d-flex justify-content-between align-items-center mb-3">
 <div>
 <div class="small fw-semibold">Serviços</div>
 <h4 class="h6 fw-bold mb-0">Base de serviços aplicada na OS</h4>
 </div>
 <button type="button" class="btn btn-outline-secondary rounded-pill" @click="addServiceRow">
 <i class="fa-solid fa-plus me-2"></i>
 Adicionar serviço
 </button>
 </div>

 <div v-if="form.services.length" class="d-grid gap-3">
 <div v-for="(service, index) in form.services" :key="'service-' + index" class="panel-card bg-light-subtle border border-secondary-subtle">
 <div class="row g-3 align-items-end">
 <div class="col-lg-8">
 <label class="form-label fw-semibold">Serviço</label>
 <select v-model.number="service.serviceId" class="form-select rounded-4" @change="syncService(index)">
 <option :value="0">Selecione</option>
 <option v-for="serviceItem in serviceCatalog" :key="serviceItem.id" :value="serviceItem.id">
 {{ serviceItem.name }} | {{ currency(serviceItem.price_amount) }} | {{ minutesLabel(serviceItem.estimated_minutes) }}
 </option>
 </select>
 </div>
 <div class="col-lg-2">
 <label class="form-label fw-semibold">Qtd</label>
 <input v-model.number="service.quantity" type="number" min="1" class="form-control rounded-4" @input="service.lineTotal = calculateServiceLineTotal(service)" />
 </div>
 <div class="col-lg-2">
 <label class="form-label fw-semibold">Preço base</label>
 <div class="form-control rounded-4 bg-body-tertiary">{{ currency(service.unitPrice) }}</div>
 </div>
 <div class="col-lg-1 text-end">
 <button type="button" class="btn btn-outline-danger rounded-pill w-100" @click="removeService(index)">
 <i class="fa-solid fa-trash"></i>
 </button>
 </div>
 </div>
 <div v-if="service.serviceName" class="small mt-2">{{ service.serviceName }} | {{ minutesLabel(service.estimatedMinutes) }} | Total {{ currency(calculateServiceLineTotal(service)) }}</div>
 </div>
 </div>
 <div v-else>Nenhum serviço vinculado ainda.</div>
 </div>

 <div class="panel-card h-100">
 <div class="d-flex justify-content-between align-items-center mb-3">
 <div>
 <div class="small fw-semibold">Peças e produtos</div>
 <h4 class="h6 fw-bold mb-0">Consumo de catálogo na OS</h4>
 </div>
 <button type="button" class="btn btn-outline-secondary rounded-pill" @click="addItemRow">
 <i class="fa-solid fa-plus me-2"></i>
 Adicionar item
 </button>
 </div>

 <div v-if="form.items.length" class="d-grid gap-3">
 <div v-for="(item, index) in form.items" :key="'item-' + index" class="panel-card bg-light-subtle border border-secondary-subtle">
 <div class="row g-3 align-items-end">
 <div class="col-lg-5">
 <label class="form-label fw-semibold">Item do catálogo</label>
 <select v-model.number="item.catalogItemId" class="form-select rounded-4" @change="syncItem(index)">
 <option :value="0">Selecione</option>
 <option v-for="catalogItem in catalogItems" :key="catalogItem.id" :value="catalogItem.id">
 {{ catalogItem.name }}{{ catalogItem.brand ? ' | ' + catalogItem.brand : '' }} | {{ catalogItem.sku || 'sem SKU' }} | estoque {{ catalogItem.stock_quantity }}
 </option>
 </select>
 </div>
 <div class="col-lg-2">
 <label class="form-label fw-semibold">Qtd</label>
 <input v-model.number="item.quantity" type="number" min="1" class="form-control rounded-4" />
 </div>
 <div class="col-lg-3">
 <label class="form-label fw-semibold">Preço</label>
 <div class="form-control rounded-4 bg-body-tertiary">{{ currency(item.unitPrice) }}</div>
 </div>
 <div class="col-lg-2 text-end">
 <button type="button" class="btn btn-outline-danger rounded-pill w-100" @click="removeItem(index)">
 <i class="fa-solid fa-trash"></i>
 </button>
 </div>
 </div>
 <div v-if="item.catalogItemId" class="small mt-2">Estoque atual: {{ item.currentStock }} | SKU: {{ item.sku || 'sem SKU' }}</div>
 </div>
 </div>
 <div v-else>Nenhum item vinculado ainda.</div>
 </div>

 <div class="panel-card h-100">
 <div class="d-flex justify-content-between align-items-center mb-3">
 <div>
 <div class="small fw-semibold">Encomendar produto</div>
 <h4 class="h6 fw-bold mb-0">Produtos ainda não existentes na loja</h4>
 </div>
 <button type="button" class="btn btn-outline-secondary rounded-pill" @click="addRequestedProductRow">
 <i class="fa-solid fa-plus me-2"></i>
 Adicionar pedido
 </button>
 </div>

 <div v-if="form.requestedProducts.length" class="d-grid gap-3">
 <div v-for="(requestedProduct, index) in form.requestedProducts" :key="'requested-' + index" class="panel-card bg-light-subtle border border-secondary-subtle">
 <div class="row g-3 align-items-end">
 <div class="col-lg-6">
 <label class="form-label fw-semibold">Nome do produto</label>
 <input v-model="requestedProduct.name" class="form-control rounded-4" placeholder="Ex.: Tela 15.6 Full HD para notebook" />
 </div>
 <div class="col-lg-2">
 <label class="form-label fw-semibold">Qtd</label>
 <input v-model.number="requestedProduct.quantity" type="number" min="1" class="form-control rounded-4" />
 </div>
 <div class="col-lg-3">
 <label class="form-label fw-semibold">Valor de venda</label>
 <input v-model.number="requestedProduct.salePrice" type="number" min="0" step="0.01" class="form-control rounded-4" />
 </div>
 <div class="col-lg-1 text-end">
 <button type="button" class="btn btn-outline-danger rounded-pill w-100" @click="removeRequestedProduct(index)">
 <i class="fa-solid fa-trash"></i>
 </button>
 </div>
 </div>
 </div>
 </div>
 <div v-else>Nenhum produto pendente de encomenda.</div>
 </div>
 </div>
 </div>

 <div v-else class="row g-4">
<div class="col-lg-6">
<div class="panel-card h-100">
<div class="small fw-semibold mb-3">Revisão final da abertura</div>
<div class="mb-3"><strong>Cliente:</strong> {{ selectedClientLabel }}</div>
<div class="mb-3"><strong>Endereço:</strong> {{ clientMode === 'new' ? (newClient.noAddress ? 'Sem endereço' : (newClient.address || 'Não informado')) : (selectedClientAddress || 'Não informado') }}</div>
<div class="mb-3"><strong>Equipamento:</strong> {{ form.equipmentName || 'Não informado' }}</div>
<div class="mb-3"><strong>Acessórios:</strong> {{ accessorySummary }}</div>
<div class="mb-3"><strong>Defeito relatado:</strong> {{ form.defect || 'Não informado' }}</div>
<div class="mb-3"><strong>Estado físico:</strong> {{ form.extras || 'Não informado' }}</div>
<div class="mb-0"><strong>Pré-aprovado:</strong> {{ form.preApproved ? 'Sim' : 'Não' }}</div>
 </div>
 </div>
 <div class="col-lg-6">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Resumo automático</div>
 <div class="row g-3">
 <div class="col-md-6">
 <label class="form-label fw-semibold">Status da OS</label>
 <select v-model="currentOrderStatus" class="form-select rounded-4">
 <option v-for="item in session.meta?.orderStatuses || []" :key="item.code" :value="item.code">{{ item.label }}</option>
 </select>
 <div class="small mt-2">Quando a OS for concluída, o financeiro entra na conta escolhida abaixo.</div>
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold">Conta de recebimento</label>
 <select v-model="form.paymentMethod" class="form-select rounded-4">
 <option v-for="item in paymentMethodOptions" :key="item.code" :value="item.code">{{ item.label }}</option>
 </select>
 <div class="small mt-2">Use a conta real onde o valor caiu no fluxo de caixa.</div>
 </div>
 <div class="col-md-6">
 <div class="small fw-semibold mb-1">Itens do catálogo</div>
 <div class="fs-5 fw-bold">{{ currency(partsTotal) }}</div>
 </div>
 <div class="col-md-6">
 <div class="small fw-semibold mb-1">Serviços</div>
 <div class="fs-5 fw-bold">{{ currency(servicesTotal) }}</div>
 </div>
 <div class="col-md-6">
 <div class="small fw-semibold mb-1">Solicitados</div>
 <div class="fs-5 fw-bold">{{ currency(requestedProductsTotal) }}</div>
 </div>
<div class="col-md-6">
<div class="small fw-semibold mb-1">Previsão automática</div>
<div class="fs-5 fw-bold">{{ dateLabel(predictedDueDate) }}</div>
</div>
<div class="col-md-6">
<div class="small fw-semibold mb-1">Previsão final</div>
<div class="fs-5 fw-bold">{{ dueDateLabel(resolvedDueDate) }}</div>
</div>
 <div class="col-md-6">
 <div class="small fw-semibold mb-1">Prazo base</div>
 <div class="fs-5 fw-bold">{{ minutesLabel(estimatedServiceMinutes) }}</div>
 </div>
<div class="col-12">
<div class="small fw-semibold mb-1">Orçamento final</div>
<div class="fs-3 fw-bold text-success">{{ quoteLabel(resolvedQuoteAmount) }}</div>
</div>
 </div>
 </div>
 </div>
 </div>
 </OrderWizard>
 </div>
 </ModalDialog>
 </AppShell>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppShell from "../components/AppShell.vue";
import ClientLookupField from "../components/ClientLookupField.vue";
import DataTable from "../components/DataTable.vue";
import FilterDrawer from "../components/FilterDrawer.vue";
import MultiMediaCaptureField from "../components/MultiMediaCaptureField.vue";
import MetricCard from "../components/MetricCard.vue";
import ModalDialog from "../components/ModalDialog.vue";
import OrderWizard from "../components/OrderWizard.vue";
import PhoneLink from "../components/PhoneLink.vue";
import SelectionActionBar from "../components/SelectionActionBar.vue";
import { api } from "../services/api";
import { currency, labelFor, toneFor } from "../services/format";
import { ACCESSORY_OPTIONS, composeOrderNotes, splitOrderNotes } from "../services/orderNotes";
import { notifyError, notifySuccess } from "../services/ui";
import { useSessionStore } from "../stores/session";
import type {
 CatalogItem,
 ClientSummary,
 MediaUploadPayload,
 OrderDetail,
 OrderSummary,
 OrderTimelinePayload,
 ServiceCatalogItem
} from "../services/types";
import type { RequestedProduct } from "../services/types";

type EditableOrderItem = {
 catalogItemId: number;
 quantity: number;
 itemName: string;
 sku: string;
 unitCost: number;
 unitPrice: number;
 currentStock: number;
};

type EditableOrderService = {
 serviceId: number;
 quantity: number;
 serviceName: string;
 unitPrice: number;
 additionalUnitPrice: number;
 pricingMode: string;
 lineTotal: number;
 estimatedMinutes: number;
};

type EditableRequestedProduct = RequestedProduct & {
 name: string;
 quantity: number;
 salePrice: number;
 status: string;
};

const DRAFT_KEY = "be-order-draft-v2";

const session = useSessionStore();
const route = useRoute();
const router = useRouter();
const ordersTable = ref<any>(null);
const orders = ref<OrderSummary[]>([]);
const clients = ref<ClientSummary[]>([]);
const catalogItems = ref<CatalogItem[]>([]);
const serviceCatalog = ref<ServiceCatalogItem[]>([]);
const selectedRows = ref<OrderSummary[]>([]);
const selectedOrder = ref<(OrderDetail & { accessories: string[]; accessories_other: string; clean_notes: string }) | null>(null);
const selectedTimeline = ref<OrderTimelinePayload | null>(null);
const showDetail = ref(false);
const showForm = ref(false);
const activeStep = ref(0);
const orderAttachments = ref<MediaUploadPayload[]>([]);
const existingOrderAttachmentPreviews = ref<Array<{ url: string; name?: string }>>([]);
const clientMode = ref<"existing" | "new">("existing");
const createRouteToken = ref("");
const currentOrderStatus = ref("ABERTA");
const fallbackPaymentMethods = [
 { code: "CC_PIX_PJ_MAQ_VERM", label: "C/C pix PJ e maq verm" },
 { code: "MAQ_AMARELA_PIX_CEL", label: "Maq Amarela/pix cel" },
 { code: "CAIXINHA_LOJA", label: "Caixinha loja" },
 { code: "R_COM_DENIO", label: "R$ com Denio" },
 { code: "OUTROS_REGINA", label: "outros Regina" },
 { code: "ARTHUR", label: "Arthur" },
 { code: "BOLETOS", label: "boletos" }
];

const steps = [
 { key: "reception", label: "Recepção" },
 { key: "diagnostic", label: "Diagnóstico" },
 { key: "budget", label: "Orçamento" },
 { key: "review", label: "Revisão" }
];

const filters = reactive({
 search: "",
 orderStatus: "",
 approvalStatus: ""
});

const form = reactive({
 id: 0,
 code: "",
 clientId: 0,
 equipmentName: "",
 accessories: [] as string[],
 accessoriesOther: "",
 defect: "",
 extras: "",
 preApproved: false,
 paymentMethod: "CAIXINHA_LOJA",
 manualQuoteEnabled: false,
 manualQuoteAmount: 0,
 withoutQuote: false,
 manualDueDateEnabled: false,
 withoutDueDate: false,
 dueDate: "",
 items: [] as EditableOrderItem[],
 services: [] as EditableOrderService[],
 requestedProducts: [] as EditableRequestedProduct[]
});

const newClient = reactive({
 name: "",
 phone: "",
 address: "",
 noAddress: false
});

const openOrders = computed(() => orders.value.filter((item) => ["ABERTA", "EM_ANDAMENTO"].includes(item.order_status)).length);
const pendingApproval = computed(() => orders.value.filter((item) => item.approval_status === "AGUARDANDO_APROVACAO").length);
const totalValue = computed(() => orders.value.reduce((sum, item) => sum + Number(item.total_amount || 0), 0));
const partsTotal = computed(() => form.items.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 1), 0));
const servicesTotal = computed(() => form.services.reduce((sum, item) => sum + calculateServiceLineTotal(item), 0));
const requestedProductsTotal = computed(() => form.requestedProducts.reduce((sum, item) => item.status === "NEGADO" ? sum : sum + Number(item.salePrice || 0) * Number(item.quantity || 1), 0));
const estimatedServiceMinutes = computed(() => form.services.reduce((maxMinutes, item) => Math.max(maxMinutes, Number(item.estimatedMinutes || 0)), 0));
const automaticQuote = computed(() => Math.max(0, partsTotal.value + servicesTotal.value + requestedProductsTotal.value));
const predictedDueDate = computed(() => buildPredictedDueDate(estimatedServiceMinutes.value));
const resolvedQuoteAmount = computed(() => {
 if (form.withoutQuote) {
  return null;
 }
 if (form.manualQuoteEnabled) {
  return Math.max(0, Number(form.manualQuoteAmount || 0));
 }
 return automaticQuote.value;
});
const resolvedDueDate = computed(() => {
 if (form.withoutDueDate) {
  return "";
 }
 if (form.manualDueDateEnabled) {
  return form.dueDate;
 }
 return predictedDueDate.value;
});
const accessorySummary = computed(() => form.accessories.length ? form.accessories.join(", ") : "Nenhum acessório marcado");
const paymentMethodOptions = computed(() => {
 const base = session.meta?.paymentMethods?.length ? session.meta.paymentMethods : fallbackPaymentMethods;
 return base.some((item) => item.code === form.paymentMethod)
 ? base
 : [...base, { code: form.paymentMethod, label: form.paymentMethod }];
});
const selectedClientLabel = computed(() => {
 if (clientMode.value === "new") {
 return newClient.name || "Novo cliente";
 }
 return clients.value.find((item) => item.id === Number(form.clientId))?.name || "Cliente não selecionado";
});
const selectedClientAddress = computed(() => clients.value.find((item) => item.id === Number(form.clientId))?.address || "");

function closeActionMenu(target: HTMLElement | null) {
 target?.closest("details")?.removeAttribute("open");
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

function dateLabel(value: string | null | undefined) {
 if (!value) {
 return "Sem previsão";
 }
 const raw = String(value);
 const dateOnly = raw.slice(0, 10);
 if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
 const [year, month, day] = dateOnly.split("-");
 return day + "/" + month + "/" + year;
 }
 return raw;
}

function dueDateLabel(value: string | null | undefined) {
 return value ? dateLabel(value) : "Sem previsão";
}

function quoteLabel(value: number | null | undefined) {
 return value === null || value === undefined ? "Sem orçamento" : currency(value);
}

function buildPredictedDueDate(totalMinutes: number) {
 const openedAt = new Date();
 const safeMinutes = Math.max(0, Number(totalMinutes || 0));
 if (!safeMinutes) {
 return new Date().toISOString().slice(0, 10);
 }
 const workDays = Math.max(1, Math.ceil(safeMinutes / (8 * 60)) || 1);
 const current = new Date(openedAt.getFullYear(), openedAt.getMonth(), openedAt.getDate(), 12, 0, 0, 0);
 let remaining = workDays;
 while (remaining > 0) {
 current.setDate(current.getDate() + 1);
 const day = current.getDay();
 if (day !== 0 && day !== 6) {
 remaining -= 1;
 }
 }
 const year = String(current.getFullYear());
 const month = String(current.getMonth() + 1).padStart(2, "0");
 const day = String(current.getDate()).padStart(2, "0");
 return year + "-" + month + "-" + day;
}

function minutesCompact(minutes: number) {
 const safeMinutes = Math.max(0, Number(minutes || 0));
 return safeMinutes ? String(safeMinutes) + "m" : "-";
}

function minutesLabel(minutes: number) {
 const days = Math.max(0, Math.ceil(Number(minutes || 0) / (8 * 60)));
 return days > 0 ? String(days) + " dia(s)" : "No ato";
}


function calculateServiceLineTotal(service: EditableOrderService) {
 const quantity = Math.max(1, Number(service.quantity || 1));
 const basePrice = Math.max(0, Number(service.unitPrice || 0));
 const additionalPrice = Math.max(0, Number(service.additionalUnitPrice || 0));
 if (String(service.pricingMode || 'FIXED').toUpperCase() === 'PROGRESSIVE') {
 return basePrice + Math.max(0, quantity - 1) * additionalPrice;
 }
 return basePrice * quantity;
}

function isPdfUrl(value: string | null | undefined) {
 const normalized = String(value || "").toLowerCase();
 return normalized.startsWith("data:application/pdf") || normalized.endsWith(".pdf") || normalized.includes(".pdf?");
}

function createItemRow(): EditableOrderItem {
 return {
 catalogItemId: 0,
 quantity: 1,
 itemName: "",
 sku: "",
 unitCost: 0,
 unitPrice: 0,
 currentStock: 0
 };
}

function createServiceRow(): EditableOrderService {
 return {
 serviceId: 0,
 quantity: 1,
 serviceName: "",
 unitPrice: 0,
 additionalUnitPrice: 0,
 pricingMode: 'FIXED',
 lineTotal: 0,
 estimatedMinutes: 0
 };
}

function createRequestedProductRow(): EditableRequestedProduct {
 return {
 id: 0,
 name: "",
 quantity: 1,
 salePrice: 0,
 status: 'PENDENTE'
 };
}

function withNotes(order: OrderDetail) {
 const parsedNotes = splitOrderNotes(order.notes || "");
 return {
 ...order,
 accessories: parsedNotes.accessories,
 accessories_other: parsedNotes.accessoriesOther,
 clean_notes: parsedNotes.notes
 };
}

function resetForm() {
 Object.assign(form, {
 id: 0,
 code: "",
 clientId: 0,
 equipmentName: "",
 accessories: [],
 accessoriesOther: "",
 defect: "",
  extras: "",
 preApproved: false,
 paymentMethod: "CAIXINHA_LOJA",
 manualQuoteEnabled: false,
 manualQuoteAmount: 0,
 withoutQuote: false,
 manualDueDateEnabled: false,
 withoutDueDate: false,
 dueDate: "",
 items: [],
 services: [],
 requestedProducts: []
 });
 Object.assign(newClient, { name: "", phone: "", address: "", noAddress: false });
 currentOrderStatus.value = "ABERTA";
 clientMode.value = "existing";
 orderAttachments.value = [];
 existingOrderAttachmentPreviews.value = [];
 activeStep.value = 0;
}

async function loadDependencies() {
 const [clientResponse, catalogResponse, servicesResponse] = await Promise.all([
 api.clients(),
 api.catalog({ activeOnly: true }),
 api.services({ activeOnly: true, availableInOrder: true })
 ]);
 clients.value = clientResponse.data;
 catalogItems.value = catalogResponse.data;
 serviceCatalog.value = servicesResponse.data;
}

async function loadOrders() {
 try {
 const response = await api.orders(filters);
 orders.value = response.data;
 } catch (error) {
 await notifyError(error);
 }
}

function clearFilters() {
 Object.assign(filters, { search: "", orderStatus: "", approvalStatus: "" });
 loadOrders();
}

function handleSelectionChange(rows: Record<string, unknown>[]) {
 selectedRows.value = rows as OrderSummary[];
}

function selectAllOrders() {
 ordersTable.value?.selectAllRows?.();
}

function clearOrderSelection() {
 ordersTable.value?.clearSelection?.();
}

async function removeSelectedOrders() {
 for (const order of selectedRows.value) {
 await removeOrder(order, false);
 }
 await loadDependencies();
 await loadOrders();
 clearOrderSelection();
 await notifySuccess("OS selecionadas excluídas");
}

function persistDraft() {
 const key = form.id ? DRAFT_KEY + "-" + form.id : DRAFT_KEY;
 const payload = {
  form: {
   ...form,
   items: form.items.map((item) => ({ ...item })),
   services: form.services.map((service) => ({ ...service })),
   requestedProducts: form.requestedProducts.map((item) => ({ ...item }))
  },
  newClient: { ...newClient },
  clientMode: clientMode.value,
  existingOrderAttachmentPreviews: existingOrderAttachmentPreviews.value,
  currentOrderStatus: currentOrderStatus.value
 };

 try {
  window.localStorage.setItem(key, JSON.stringify(payload));
  return true;
 } catch {
  window.localStorage.removeItem(key);
  return false;
 }
}

function saveDraft() {
 if (persistDraft()) {
  notifySuccess("Rascunho salvo");
  return;
 }
 notifyError(new Error("O rascunho foi salvo sem anexos locais. Finalize o envio das imagens antes de sair da tela."));
}

function restoreDraft() {
 const key = form.id ? DRAFT_KEY + "-" + form.id : DRAFT_KEY;
 const raw = window.localStorage.getItem(key);
 if (!raw) {
 return;
 }

 try {
 const parsed = JSON.parse(raw);
 form.id = Number(parsed.form?.id || 0);
 form.code = String(parsed.form?.code || "");
 form.clientId = Number(parsed.form?.clientId || 0);
 form.equipmentName = String(parsed.form?.equipmentName || "");
 form.accessories = Array.isArray(parsed.form?.accessories) ? parsed.form.accessories.map((item: unknown) => String(item || "")).filter(Boolean) : [];
 form.accessoriesOther = String(parsed.form?.accessoriesOther || "");
 form.defect = String(parsed.form?.defect || "");
 form.extras = String(parsed.form?.extras || "");
 form.preApproved = Boolean(parsed.form?.preApproved);
 form.paymentMethod = String(parsed.form?.paymentMethod || "CAIXINHA_LOJA");
 form.manualQuoteEnabled = Boolean(parsed.form?.manualQuoteEnabled);
 form.manualQuoteAmount = Number(parsed.form?.manualQuoteAmount || 0);
 form.withoutQuote = Boolean(parsed.form?.withoutQuote);
 form.manualDueDateEnabled = Boolean(parsed.form?.manualDueDateEnabled);
 form.withoutDueDate = Boolean(parsed.form?.withoutDueDate);
 form.dueDate = String(parsed.form?.dueDate || "");
 form.items = Array.isArray(parsed.form?.items)
 ? parsed.form.items.map((item: any) => ({
 catalogItemId: Number(item.catalogItemId || 0),
 quantity: Math.max(1, Number(item.quantity || 1)),
 itemName: String(item.itemName || ""),
 sku: String(item.sku || ""),
 unitCost: Number(item.unitCost || 0),
 unitPrice: Number(item.unitPrice || 0),
 currentStock: Number(item.currentStock || 0)
 }))
 : [];
 form.services = Array.isArray(parsed.form?.services)
 ? parsed.form.services.map((service: any) => ({
 serviceId: Number(service.serviceId || 0),
 quantity: Math.max(1, Number(service.quantity || 1)),
 serviceName: String(service.serviceName || ""),
 unitPrice: Number(service.unitPrice || 0),
 additionalUnitPrice: Number(service.additionalUnitPrice || 0),
 pricingMode: String(service.pricingMode || 'FIXED'),
 lineTotal: Number(service.lineTotal || 0),
 estimatedMinutes: Number(service.estimatedMinutes || 0)
 }))
 : [];
 form.requestedProducts = Array.isArray(parsed.form?.requestedProducts)
 ? parsed.form.requestedProducts.map((item: any) => ({
 id: Number(item.id || 0),
 name: String(item.name || item.product_name || ""),
 quantity: Math.max(1, Number(item.quantity || 1)),
 salePrice: Number(item.salePrice || item.sale_price || 0),
 status: String(item.status || 'PENDENTE')
 }))
 : [];
 Object.assign(newClient, {
  name: parsed.newClient?.name || "",
  phone: parsed.newClient?.phone || "",
  address: parsed.newClient?.address || "",
  noAddress: Boolean(parsed.newClient?.noAddress)
 });
 clientMode.value = parsed.clientMode || "existing";
 orderAttachments.value = [];
 existingOrderAttachmentPreviews.value = Array.isArray(parsed.existingOrderAttachmentPreviews) ? parsed.existingOrderAttachmentPreviews : [];
 currentOrderStatus.value = String(parsed.currentOrderStatus || currentOrderStatus.value || "ABERTA");
 } catch {
 window.localStorage.removeItem(key);
 }
}

function clearDraft(orderId?: number) {
 window.localStorage.removeItem(DRAFT_KEY);
 if (orderId) {
 window.localStorage.removeItem(DRAFT_KEY + "-" + orderId);
 }
}

function openCreate() {
 resetForm();
 restoreDraft();
 showForm.value = true;
}

async function openDetail(row: Record<string, unknown>) {
 const orderId = Number(row.id || 0);
 if (!orderId) {
 return;
 }
 await router.push("/os/" + orderId);
}

function hydrateForm(order: OrderDetail) {
 const parsedNotes = splitOrderNotes(order.notes || "");
 form.id = order.id;
 form.code = order.code;
 form.clientId = order.client_id;
 form.equipmentName = order.equipment;
 form.accessories = parsedNotes.accessories;
 form.accessoriesOther = parsedNotes.accessoriesOther;
 form.defect = order.defect;
 form.extras = order.extras;
 form.preApproved = order.approval_status === "PRE_APROVADA";
 form.paymentMethod = order.payment_method || "CAIXINHA_LOJA";
 form.dueDate = String(order.due_date || "").slice(0, 10);
 form.items = order.items.map((item) => ({
 catalogItemId: Number(item.catalog_item_id || item.catalogItemId || 0),
 quantity: Math.max(1, Number(item.quantity || 1)),
 itemName: String(item.item_name || ""),
 sku: String(item.sku || ""),
 unitCost: Number(item.unit_cost || item.unitCost || 0),
 unitPrice: Number(item.unit_price || item.unitPrice || 0),
 currentStock: Number(item.current_stock || 0)
 }));
 form.services = order.services.map((service) => ({
 serviceId: Number(service.service_id || service.serviceId || 0),
 quantity: Math.max(1, Number(service.quantity || 1)),
 serviceName: String(service.service_name || ""),
 unitPrice: Number(service.unit_price || service.unitPrice || 0),
 additionalUnitPrice: 0,
 pricingMode: 'FIXED',
 lineTotal: Number(service.line_total || service.lineTotal || 0),
 estimatedMinutes: Number(service.estimated_minutes || 0)
 }));
 form.requestedProducts = (order.requested_products || []).map((item) => ({
 id: Number(item.id || 0),
 name: String(item.product_name || item.name || ""),
 quantity: Math.max(1, Number(item.quantity || 1)),
 salePrice: Number(item.sale_price || item.salePrice || 0),
 status: String(item.status || 'PENDENTE')
 }));
 form.withoutQuote = order.quote_amount === null || order.quote_amount === undefined;
 form.manualQuoteAmount = Number(order.quote_amount || 0);
 form.manualQuoteEnabled = !form.withoutQuote && Math.abs(Number(order.quote_amount || 0) - automaticQuote.value) > 0.009;
 form.withoutDueDate = !String(order.due_date || "").trim();
 form.manualDueDateEnabled = !form.withoutDueDate && String(order.due_date || "").slice(0, 10) !== predictedDueDate.value;
 currentOrderStatus.value = order.order_status || "ABERTA";
 orderAttachments.value = [];
 existingOrderAttachmentPreviews.value = order.attachments?.length
  ? order.attachments.map((attachment) => ({ url: attachment.url, name: attachment.file_name }))
  : order.photo_url
   ? [{ url: order.photo_url, name: "Anexo existente" }]
   : [];
 clientMode.value = "existing";
 activeStep.value = 0;
}

async function openEditById(orderId: number) {
 try {
 const response = await api.order(orderId);
 showDetail.value = false;
 hydrateForm(response.data);
 restoreDraft();
 showForm.value = true;
 } catch (error) {
 await notifyError(error);
 }
}

function handleAccessoryToggle(accessory: string, event: Event) {
 const input = event.target as HTMLInputElement;
 const checked = input.checked;

 if (accessory === "Sem acessórios") {
 form.accessories = checked ? ["Sem acessórios"] : [];
 form.accessoriesOther = "";
 return;
 }

 const next = form.accessories.filter((item) => item !== "Sem acessórios" && item !== accessory);
 if (checked) {
 next.push(accessory);
 }
 form.accessories = next;

 if (!form.accessories.includes("Outro")) {
 form.accessoriesOther = "";
 }
}

function addItemRow() {
 form.items.push(createItemRow());
}

function removeItem(index: number) {
 form.items.splice(index, 1);
}

function syncItem(index: number) {
 const item = form.items[index];
 const catalogItem = catalogItems.value.find((entry) => entry.id === Number(item.catalogItemId));
 if (!catalogItem) {
 form.items[index] = createItemRow();
 return;
 }
 item.itemName = catalogItem.name;
 item.sku = String(catalogItem.sku || "");
 item.unitCost = Number(catalogItem.cost_amount || 0);
 item.unitPrice = Number(catalogItem.price_amount || 0);
 item.currentStock = Number(catalogItem.stock_quantity || 0);
}

function addServiceRow() {
 form.services.push(createServiceRow());
}

function removeService(index: number) {
 form.services.splice(index, 1);
}

function syncService(index: number) {
 const service = form.services[index];
 const catalogService = serviceCatalog.value.find((entry) => entry.id === Number(service.serviceId));
 if (!catalogService) {
 form.services[index] = createServiceRow();
 return;
 }
 service.serviceName = catalogService.name;
 service.unitPrice = Number(catalogService.price_amount || 0);
 service.additionalUnitPrice = Number(catalogService.additional_price_amount || 0);
 service.pricingMode = String(catalogService.pricing_mode || 'FIXED');
 service.estimatedMinutes = Number(catalogService.estimated_minutes || 0);
 service.quantity = Math.max(1, Number(service.quantity || 1));
 service.lineTotal = calculateServiceLineTotal(service);
}

function addRequestedProductRow() {
 form.requestedProducts.push(createRequestedProductRow());
}

function removeRequestedProduct(index: number) {
 form.requestedProducts.splice(index, 1);
}

function goNext() {
 activeStep.value = Math.min(steps.length - 1, activeStep.value + 1);
}

function goBack() {
 activeStep.value = Math.max(0, activeStep.value - 1);
}

async function saveOrder() {
 try {
 if (clientMode.value === "existing" && !form.clientId) {
 throw new Error("Selecione um cliente para a OS.");
 }
 if (clientMode.value === "new" && (!newClient.name.trim() || !newClient.phone.trim())) {
 throw new Error("Nome e telefone do cliente são obrigatórios.");
 }
 if (clientMode.value === "new" && !newClient.noAddress && !newClient.address.trim()) {
 throw new Error("Informe o endereço do cliente ou marque sem endereço.");
 }
 if (!form.equipmentName.trim()) {
 throw new Error("Informe o equipamento recebido.");
 }
 if (!form.accessories.length) {
 throw new Error("Selecione ao menos uma opção em acessórios recebidos.");
 }
 if (form.accessories.includes("Outro") && !form.accessoriesOther.trim()) {
 throw new Error("Descreva o acessório adicional marcado em Outros.");
 }
 if (!form.defect.trim()) {
 throw new Error("Informe o defeito relatado.");
 }
 if (!form.extras.trim()) {
 throw new Error("Informe o estado físico do aparelho.");
 }

 let clientId = form.clientId;
 if (clientMode.value === "new") {
 const createdClient = await api.saveClient({
 name: newClient.name,
 phone: newClient.phone,
 address: newClient.noAddress ? "" : newClient.address
 });
 clientId = createdClient.data.id;
 }

 const response = await api.saveOrder({
 id: form.id || undefined,
 clientId,
  equipmentName: form.equipmentName,
  equipment: form.equipmentName,
  orderStatus: currentOrderStatus.value,
  dueDate: resolvedDueDate.value,
  withoutDueDate: form.withoutDueDate,
  accessories: form.accessories,
  accessoriesOther: form.accessories.includes("Outro") ? form.accessoriesOther : "",
  defect: form.defect,
  extras: form.extras,
  preApproved: form.preApproved,
  quoteAmount: resolvedQuoteAmount.value,
  withoutQuote: form.withoutQuote,
  paymentMethod: form.paymentMethod,
  notes: composeOrderNotes("", form.accessories, form.accessories.includes("Outro") ? form.accessoriesOther : ""),
 items: form.items.filter((item) => item.catalogItemId).map((item) => ({ catalogItemId: item.catalogItemId, quantity: item.quantity })),
 services: form.services.filter((item) => item.serviceId).map((item) => ({ serviceId: item.serviceId, quantity: item.quantity })),
 requestedProducts: form.requestedProducts.filter((item) => item.name.trim()).map((item) => ({ id: item.id, name: item.name.trim(), quantity: item.quantity, salePrice: item.salePrice, status: item.status })),
  photoUploads: orderAttachments.value
 });

 clearDraft(form.id || undefined);
 showForm.value = false;
 selectedOrder.value = withNotes(response.data);
 currentOrderStatus.value = response.data.order_status || "ABERTA";
 await loadDependencies();
 await loadOrders();
 await notifySuccess("OS salva com sucesso");
 } catch (error) {
 await notifyError(error);
 }
}

async function removeOrder(order: OrderDetail | OrderSummary, showFeedback = true) {
 const confirmed = window.Swal
 ? await window.Swal.fire({
 icon: "warning",
 title: "Excluir " + order.code + "?",
 text: "Isso vai excluir a OS " + order.code + ", remover financeiro vinculado, restaurar estoque e apagar uploads locais relacionados.",
 showCancelButton: true,
 confirmButtonText: "Excluir OS",
 cancelButtonText: "Cancelar",
 confirmButtonColor: "#d95165"
 })
 : { isConfirmed: window.confirm("Excluir " + order.code + "?") };

 if (!confirmed.isConfirmed) {
 return;
 }

 try {
 await api.deleteOrder(order.id);
 if (selectedOrder.value?.id === order.id) {
 selectedOrder.value = null;
 selectedTimeline.value = null;
 showDetail.value = false;
 }
 if (form.id === order.id) {
 showForm.value = false;
 resetForm();
 }
 await loadDependencies();
 await loadOrders();
 if (showFeedback) {
 await notifySuccess("OS excluída", order.code + " foi removida com sucesso.");
 }
 } catch (error) {
 await notifyError(error);
 }
}

function openPrint(orderId = Number(form.id || selectedOrder.value?.id || 0)) {
 if (!orderId) {
 return;
 }
 window.open("/imprimir/os/" + orderId, "_blank");
}

async function maybeOpenCreateFromRoute() {
 if (route.query.createOrder !== "1") {
 createRouteToken.value = "";
 return;
 }

 const token = String(route.query.createOrder || "") + "-" + String(route.query.clientId || "");
 if (createRouteToken.value === token) {
 return;
 }

 createRouteToken.value = token;
 openCreate();
 const clientId = Number(route.query.clientId || 0);
 if (clientId) {
 clientMode.value = "existing";
 form.clientId = clientId;
 }

 const nextQuery = { ...route.query } as Record<string, any>;
 delete nextQuery.createOrder;
 delete nextQuery.clientId;
 await router.replace({ query: nextQuery });
}

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
 <button class="action-menu__item action-view" data-row-action="true"><i class="fa-solid fa-eye me-2"></i>Abrir</button>
 <button class="action-menu__item action-edit" data-row-action="true"><i class="fa-solid fa-pen me-2"></i>Editar</button>
 <button class="action-menu__item action-print" data-row-action="true"><i class="fa-solid fa-print me-2"></i>Imprimir</button>
 <button class="action-menu__item action-delete" data-row-action="true"><i class="fa-solid fa-trash me-2"></i>Excluir</button>
 </div>
 </details>
 </div>
 `,
 cellClick: async (event: MouseEvent, cell: any) => {
 const target = event.target as HTMLElement | null;
 const rowData = cell.getRow().getData() as OrderSummary;
 event.stopPropagation();
 if (target?.closest(".action-view")) {
 closeActionMenu(target);
 await openDetail(rowData);
 return;
 }
 if (target?.closest(".action-edit")) {
 closeActionMenu(target);
 await openEditById(Number(rowData.id));
 return;
 }
 if (target?.closest(".action-print")) {
 closeActionMenu(target);
 openPrint(Number(rowData.id));
 return;
 }
 if (target?.closest(".action-delete")) {
 closeActionMenu(target);
 await removeOrder(rowData);
 }
 }
 },
 { title: "Cliente", field: "client_name", minWidth: 180, cssClass: "cell-wrap", variableHeight: true },
 {
 title: "Status",
 field: "order_status",
 minWidth: 160,
 formatter: (cell: any) => `<span class="badge text-bg-${orderStatusTone(String(cell.getValue() || ''))}">${orderStatusLabel(String(cell.getValue() || ''))}</span>`
 },
 { title: "Equipamento", field: "equipment", minWidth: 220, cssClass: "cell-wrap", variableHeight: true },
 {
 title: "Aprovação",
 field: "approval_status",
 minWidth: 170,
 formatter: (cell: any) => `<span class="badge text-bg-${approvalStatusTone(String(cell.getValue() || ''))}">${approvalStatusLabel(String(cell.getValue() || ''))}</span>`
 },
 { title: "Total", field: "total_amount", minWidth: 130, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Código", field: "code", minWidth: 175 },
 { title: "ID", field: "id", hozAlign: "center", width: 90 }
];

watch(
 () => ({ ...filters }),
 (state) => {
 router.replace({
 query: {
 search: state.search || undefined,
 orderStatus: state.orderStatus || undefined,
 approvalStatus: state.approvalStatus || undefined
 }
 });
 },
 { deep: true }
);

watch(
 () => route.query,
 async () => {
 filters.search = String(route.query.search || "");
 filters.orderStatus = String(route.query.orderStatus || "");
 filters.approvalStatus = String(route.query.approvalStatus || "");
 await loadOrders();
 await maybeOpenCreateFromRoute();
 },
 { deep: true }
);

watch(
 () => ({
  form: { ...form, items: form.items.map((item) => ({ ...item })), services: form.services.map((service) => ({ ...service })), requestedProducts: form.requestedProducts.map((item) => ({ ...item })) },
  newClient: { ...newClient },
  clientMode: clientMode.value,
  existingOrderAttachmentPreviews: existingOrderAttachmentPreviews.value,
  currentOrderStatus: currentOrderStatus.value
 }),
 () => {
 if (showForm.value) {
 persistDraft();
 }
 },
 { deep: true }
);


watch(clientMode, (mode) => {
 if (mode === "new") {
 form.clientId = 0;
 }
});

watch(
 () => form.withoutQuote,
 (value) => {
  if (value) {
   form.manualQuoteEnabled = false;
  }
 }
);

watch(
 () => form.manualQuoteEnabled,
 (value) => {
  if (value && !form.manualQuoteAmount) {
   form.manualQuoteAmount = automaticQuote.value;
  }
 }
);

watch(
 () => form.withoutDueDate,
 (value) => {
  if (value) {
   form.manualDueDateEnabled = false;
   form.dueDate = "";
  }
 }
);

watch(
 () => form.manualDueDateEnabled,
 (value) => {
  if (value && !form.dueDate) {
   form.dueDate = predictedDueDate.value;
  }
 }
);

watch(
 () => newClient.noAddress,
 (value) => {
  if (value) {
   newClient.address = "";
  }
 }
);

onMounted(async () => {
 try {
 filters.search = String(route.query.search || "");
 filters.orderStatus = String(route.query.orderStatus || "");
 filters.approvalStatus = String(route.query.approvalStatus || "");
 await loadDependencies();
 await loadOrders();
 await maybeOpenCreateFromRoute();
 } catch (error) {
 await notifyError(error);
 }
});
</script>
