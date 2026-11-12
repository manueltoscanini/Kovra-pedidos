export const categories = ['Tragos', 'Cervezas', 'Sin alcohol', 'Combos'];
export const sectors = [
  { id: 'general', name: 'Entrada general' },
  { id: 'pista', name: 'Pista' },
  { id: 'vip', name: 'VIP' },
  { id: 'terraza', name: 'Terraza' },
];

export const catalog = [
  ['fernet', 'Fernet con cola', 'Fernet, cola y mucho hielo.', 'Tragos', 29000, 1],
  ['gin', 'Gin tonic', 'Gin, tónica, pepino y lima.', 'Tragos', 34000, 1],
  ['spritz', 'Aperol spritz', 'Aperol, espumante y naranja.', 'Tragos', 36000, 1],
  ['lager', 'Lager tirada', 'Rubia, liviana y bien fría. 473 ml.', 'Cervezas', 20000, 1],
  ['fizz', 'Maracuyá fizz', 'Maracuyá, menta y lima. 0 % alcohol.', 'Sin alcohol', 23000, 0],
  ['agua', 'Agua mineral', 'Con hielo y limón. 500 ml.', 'Sin alcohol', 11000, 0],
  ['combo-fernet-lager', 'Fernet + lager', 'Un fernet con cola y una lager tirada.', 'Combos', 44000, 1],
].map(([id, name, description, category, price, alcohol], position) => ({
  id, name, description, category, price, alcohol, position, available: 1,
}));

export function availableCatalog(products) {
  const byId = new Map(products.map(product => [product.id, product]));
  return products.map(product => {
    if (product.id !== 'combo-fernet-lager') return product;
    const components = [byId.get('fernet'), byId.get('lager')];
    return {
      ...product,
      listed: product.available,
      available: Number(product.available && components.every(item => item?.available)),
      alcohol: Number(product.alcohol || components.some(item => item?.alcohol)),
      contents: components.filter(Boolean).map(item => item.name),
    };
  });
}
