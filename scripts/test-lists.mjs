import assert from 'node:assert/strict'
import { LOCATIONS, TRANSPORT_LOCATIONS, PACKAGES, PACKAGE_PRICES, packageLabel } from '../src/lib/helpers.js'
import { serviceToDbFields, expenseToDbFields } from '../src/lib/mappers.js'
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('PASS', name) }

ok('all six requested locations are in the list', () => { for (const l of ['Darad', 'Mvindeni', 'Diani Market', 'Kalipso', 'Nyumba Tatu', 'Mkwakwani']) assert.ok(LOCATIONS.includes(l), l) })
ok('no location is listed twice (Darad was already there and was not added again)', () => {
  const seen = LOCATIONS.map((l) => l.toLowerCase()); assert.equal(new Set(seen).size, seen.length)
  assert.equal(LOCATIONS.filter((l) => l === 'Darad').length, 1)
})
ok('the existing locations are untouched and in their old order', () => assert.deepEqual(LOCATIONS.slice(0, 21), ['Darad', 'Nuru plaza', 'Babla', 'Dola', 'Dodoma', 'Darling', 'Posta', 'Markas', 'Kona Beach', 'Tsunami', 'Msikti Nuru', 'Diamond', 'Pepsi', 'Kona Musa', 'Mandingo', 'Ibiza', 'Kona Chief', 'Millennium', 'Last Moran', 'Kona Tamu', 'Ratinga']))
ok('transport (office to site) offers the new locations too', () => { assert.equal(TRANSPORT_LOCATIONS[0], 'Office'); assert.ok(TRANSPORT_LOCATIONS.includes('Kalipso') && TRANSPORT_LOCATIONS.includes('Mkwakwani')) })
ok('the 25 and 30 packages sit in speed order, before "Not sure yet"', () => assert.deepEqual(PACKAGES, ['Swahili 10 Unlimited', 'Swahili 15 Unlimited', 'Swahili 20 Unlimited', 'Swahili 25 Unlimited', 'Swahili 30 Unlimited', 'Not sure yet']))
ok('prices: 25 Mbps is KSh 3,350 and 30 Mbps is KSh 2,850', () => { assert.equal(PACKAGE_PRICES['Swahili 25 Unlimited'], 3350); assert.equal(PACKAGE_PRICES['Swahili 30 Unlimited'], 2850) })
ok('the package list shows the price, but only where one is on record', () => {
  assert.equal(packageLabel('Swahili 25 Unlimited'), 'Swahili 25 Unlimited — KSh 3,350'); assert.equal(packageLabel('Swahili 30 Unlimited'), 'Swahili 30 Unlimited — KSh 2,850')
  assert.equal(packageLabel('Swahili 10 Unlimited'), 'Swahili 10 Unlimited'); assert.equal(packageLabel('Not sure yet'), 'Not sure yet')
})
ok('a service always carries a category, so the database accepts it', () => {
  const p = serviceToDbFields({ description: 'Fibre splicing', amount: '5000', providerName: 'Joe', providerContact: '0711', serviceDate: '2026-10-20' })
  assert.equal(p.category, 'Service'); assert.equal(p.entry_type, 'service'); assert.equal(p.amount, 5000); assert.equal(p.purchase_date, '2026-10-20'); assert.equal(p.provider_name, 'Joe')
})
ok('a purchase still carries the category that was chosen', () => assert.equal(expenseToDbFields({ description: 'Fuel', amount: '1500', category: 'Fuel' }).category, 'Fuel'))
console.log(`\n${n} checks passed`)
