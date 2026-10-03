// Deterministic demo data: every instance of a service answers the same
// thing for the same id, so the gateway can send a request anywhere.
export const ITEM_COUNT = 200;

const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered'];
const FIRST_NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eva', 'Felipe', 'Gabi', 'Hugo', 'Iara', 'João', 'Lia', 'Marcos'];
const LAST_NAMES = ['Silva', 'Souza', 'Costa', 'Lima', 'Rocha', 'Alves', 'Nunes', 'Gomes'];
const PRODUCTS = ['Caneca', 'Camiseta', 'Caderno', 'Mochila', 'Garrafa', 'Boné', 'Adesivo', 'Chaveiro', 'Moletom', 'Meia'];
const CENTS = 100;
const PRICE_SEED = 7919;
const MAX_PRICE_CENTS = 50_000;
const MAX_STOCK = 250;
const MAX_ITEMS_PER_ORDER = 5;

function priceFor(index) {
	return ((index * PRICE_SEED) % MAX_PRICE_CENTS) / CENTS;
}

function buildOrder(index) {
	return {
		id: index,
		customerId: (index % 37) + 1,
		status: ORDER_STATUSES[index % ORDER_STATUSES.length],
		itemCount: (index % MAX_ITEMS_PER_ORDER) + 1,
		total: priceFor(index),
	};
}

function buildUser(index) {
	const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
	const lastName = LAST_NAMES[index % LAST_NAMES.length];
	const handle = `${firstName}.${lastName}.${index}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
	return { id: index, name: `${firstName} ${lastName}`, email: `${handle}@example.com` };
}

function buildItem(index) {
	const product = PRODUCTS[index % PRODUCTS.length];
	return {
		id: index,
		sku: `SKU-${String(index).padStart(4, '0')}`,
		name: `${product} ${index}`,
		price: priceFor(index + 1),
		stock: (index * 13) % MAX_STOCK,
	};
}

export const BUILDERS = { orders: buildOrder, users: buildUser, catalog: buildItem };

export function isKnownId(id) {
	return Number.isInteger(id) && id >= 1 && id <= ITEM_COUNT;
}

export function listPage(service, offset, limit) {
	const build = BUILDERS[service];
	const first = offset + 1;
	const last = Math.min(offset + limit, ITEM_COUNT);
	const items = [];
	for (let id = first; id <= last; id++) items.push(build(id));
	return { items, total: ITEM_COUNT, offset, limit };
}
