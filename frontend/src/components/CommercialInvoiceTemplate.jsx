import React from 'react';

const HISTORY_KEY = 'ci_field_history_';

// Inline-editable field with localStorage history suggestions
const EF = ({ v, onChange, historyKey, placeholder = '', multiline, style = {}, isPrint }) => {
    const listId = historyKey ? `dl-${historyKey}` : undefined;
    const history = historyKey ? JSON.parse(localStorage.getItem(HISTORY_KEY + historyKey) || '[]') : [];
    const save = (val) => {
        if (!historyKey || !val.trim()) return;
        const updated = [val, ...history.filter(h => h !== val)].slice(0, 10);
        localStorage.setItem(HISTORY_KEY + historyKey, JSON.stringify(updated));
    };
    const base = {
        width: '100%', border: 'none', outline: 'none',
        background: 'transparent', fontFamily: 'Arial, sans-serif',
        fontSize: '11px', boxSizing: 'border-box', padding: '0', ...style
    };
    if (isPrint) return <span style={base}>{v}</span>;
    if (multiline) return (
        <textarea value={v} rows={3} onChange={e => onChange(e.target.value)} onBlur={e => save(e.target.value)}
            placeholder={placeholder} style={{ ...base, resize: 'vertical' }} />
    );
    return (
        <>
            <input list={listId} value={v} onChange={e => onChange(e.target.value)}
                onBlur={e => save(e.target.value)} placeholder={placeholder} style={base} />
            {listId && <datalist id={listId}>{history.map((h, i) => <option key={i} value={h} />)}</datalist>}
        </>
    );
};

const cell = {
    border: '1px solid #000', padding: '4px 6px', verticalAlign: 'top',
    fontFamily: 'Arial, sans-serif', fontSize: '11px'
};
const label = { fontSize: '9px', fontWeight: 'bold', display: 'block', marginBottom: '2px' };

const CommercialInvoiceTemplate = ({ doc, setDoc, isPrint, ceoSignature, companyName }) => {
    const set = (key) => (val) => setDoc(prev => ({ ...prev, [key]: val }));
    const setItem = (idx, key) => (val) => setDoc(prev => {
        const items = [...(prev.items || [])];
        items[idx] = { ...items[idx], [key]: val };
        // auto-calc amount
        const up = parseFloat(items[idx].unit_price) || 0;
        const qty = parseFloat(items[idx].qty) || 0;
        items[idx].amount = up * qty;
        return { ...prev, items };
    });
    const addItem = () => setDoc(prev => ({ ...prev, items: [...(prev.items || []), { name: '', hs_code: '', unit_price: '', qty: '', unit: 'SET', amount: 0 }] }));
    const removeItem = (idx) => setDoc(prev => { const items = [...(prev.items || [])]; items.splice(idx, 1); return { ...prev, items }; });
    const total = (doc.items || []).reduce((s, i) => s + (parseFloat(i.unit_price) || 0) * (parseFloat(i.qty) || 0), 0);

    const shipper = doc.shipper || {
        line1: 'DESIGNMECHA CO.,LTD.',
        line2: '336-35 Woram-ro, Eumbong-myeon',
        line3: 'ASAN CHUNGNAM, KOREA',
        line4: 'TEL : 82-41-544-6220. FAX : 82-41-544-6207'
    };

    return (
        <div style={{ width: '190mm', minHeight: '277mm', margin: '0 auto', background: '#fff', fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#000', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '18px', letterSpacing: '2px', margin: '0 0 8px' }}>COMMERCIAL INVOICE</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                    {/* Row 1: Shipper | Invoice No */}
                    <tr>
                        <td style={{ ...cell, width: '50%' }} rowSpan={2}>
                            <span style={label}>SHIPPER</span>
                            <div style={{ fontWeight: 'bold' }}>
                                <EF v={shipper.line1} onChange={v => setDoc(p => ({ ...p, shipper: { ...p.shipper, line1: v } }))} isPrint={isPrint} />
                                <EF v={shipper.line2} onChange={v => setDoc(p => ({ ...p, shipper: { ...p.shipper, line2: v } }))} isPrint={isPrint} />
                                <EF v={shipper.line3} onChange={v => setDoc(p => ({ ...p, shipper: { ...p.shipper, line3: v } }))} isPrint={isPrint} />
                                <EF v={shipper.line4} onChange={v => setDoc(p => ({ ...p, shipper: { ...p.shipper, line4: v } }))} style={{ color: '#00f', textDecoration: 'underline' }} isPrint={isPrint} />
                            </div>
                        </td>
                        <td style={{ ...cell, width: '50%' }}>
                            <span style={label}>INOVICE NO. AND DATE</span>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <EF v={doc.invoice_no || ''} onChange={set('invoice_no')} isPrint={isPrint} style={{ fontWeight: 'bold', width: '50%' }} />
                                <EF v={doc.invoice_date || ''} onChange={set('invoice_date')} isPrint={isPrint} style={{ width: '50%' }} />
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style={cell}>
                            <span style={label}>L/C NO. AND DATE :</span>
                            <EF v={doc.lc_no || ''} onChange={set('lc_no')} historyKey="lc_no" isPrint={isPrint} />
                        </td>
                    </tr>
                    {/* Row 2: Consignee | Notify */}
                    <tr>
                        <td style={cell}>
                            <span style={label}>CONSINGEE</span>
                            <EF v={doc.consignee || ''} onChange={set('consignee')} historyKey="consignee" multiline isPrint={isPrint} />
                        </td>
                        <td style={cell}>
                            <span style={label}>NOTIFY</span>
                            <EF v={doc.notify || ''} onChange={set('notify')} historyKey="notify" multiline isPrint={isPrint} />
                        </td>
                    </tr>
                    {/* Row 3: Sailing Date | Other References */}
                    <tr>
                        <td style={cell}>
                            <span style={label}>SAILING DATE</span>
                            <EF v={doc.sailing_date || ''} onChange={set('sailing_date')} isPrint={isPrint} />
                        </td>
                        <td style={cell}>
                            <span style={label}>OTHER REFERENCES</span>
                            <EF v={doc.other_references || ''} onChange={set('other_references')} historyKey="other_ref" multiline isPrint={isPrint} />
                        </td>
                    </tr>
                    {/* Row 4: Vessel | Terms */}
                    <tr>
                        <td style={cell}>
                            <span style={label}>VESSEL/FLIGHT</span>
                            <EF v={doc.vessel_flight || ''} onChange={set('vessel_flight')} historyKey="vessel" isPrint={isPrint} />
                        </td>
                        <td style={cell}>
                            <span style={label}>TERMS OF DELIVERY &amp; PAYMENT</span>
                            <EF v={doc.terms || ''} onChange={set('terms')} historyKey="terms" isPrint={isPrint} />
                        </td>
                    </tr>
                    {/* Row 5: From/To */}
                    <tr>
                        <td style={cell}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <div style={{ flex: 1 }}>
                                    <span style={label}>FROM</span>
                                    <EF v={doc.from_port || ''} onChange={set('from_port')} historyKey="from_port" isPrint={isPrint} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <span style={label}>TO</span>
                                    <EF v={doc.to_port || ''} onChange={set('to_port')} historyKey="to_port" isPrint={isPrint} />
                                </div>
                            </div>
                        </td>
                        <td style={cell}></td>
                    </tr>
                </tbody>
            </table>

            {/* Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '-1px' }}>
                <thead>
                    <tr>
                        <th style={{ ...cell, width: '45%', textAlign: 'left', fontSize: '9px' }}>DESCRIPTION OF GOODS</th>
                        <th style={{ ...cell, width: '20%', textAlign: 'center', fontSize: '9px' }}>HS CODE</th>
                        <th style={{ ...cell, width: '13%', textAlign: 'center', fontSize: '9px' }}>UNIT PRICE</th>
                        <th style={{ ...cell, width: '10%', textAlign: 'center', fontSize: '9px' }}>Q'TY</th>
                        <th style={{ ...cell, width: '12%', textAlign: 'center', fontSize: '9px' }}>AMOUNT</th>
                    </tr>
                </thead>
                <tbody>
                    {(doc.items || []).map((item, idx) => (
                        <tr key={idx}>
                            <td style={{ ...cell, paddingLeft: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <EF v={item.name || ''} onChange={setItem(idx, 'name')} placeholder="Item name" isPrint={isPrint} style={{ flex: 1 }} />
                                    {!isPrint && <button onClick={() => removeItem(idx)} style={{ fontSize: '10px', color: '#f00', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>✕</button>}
                                </div>
                            </td>
                            <td style={cell}>
                                <EF v={item.hs_code || ''} onChange={setItem(idx, 'hs_code')} historyKey="hs_code" placeholder="HS code" isPrint={isPrint} />
                            </td>
                            <td style={{ ...cell, textAlign: 'right' }}>
                                <EF v={item.unit_price || ''} onChange={setItem(idx, 'unit_price')} placeholder="0" isPrint={isPrint} style={{ textAlign: 'right' }} />
                            </td>
                            <td style={{ ...cell, textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                                    <EF v={item.qty || ''} onChange={setItem(idx, 'qty')} placeholder="0" isPrint={isPrint} style={{ width: '40px', textAlign: 'right' }} />
                                    <EF v={item.unit || 'SET'} onChange={setItem(idx, 'unit')} isPrint={isPrint} style={{ width: '32px' }} />
                                </div>
                            </td>
                            <td style={{ ...cell, textAlign: 'right' }}>
                                {item.unit_price && item.qty ? `USD ${((parseFloat(item.unit_price) || 0) * (parseFloat(item.qty) || 0)).toLocaleString()}` : ''}
                            </td>
                        </tr>
                    ))}
                    {!isPrint && (
                        <tr>
                            <td colSpan={5} style={{ ...cell, textAlign: 'center' }}>
                                <button onClick={addItem} style={{ fontSize: '11px', color: '#0066cc', background: 'none', border: 'none', cursor: 'pointer' }}>+ Add Item</button>
                            </td>
                        </tr>
                    )}
                    {/* Total */}
                    <tr>
                        <td colSpan={2} style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}></td>
                        <td colSpan={2} style={{ ...cell, textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>TOTAL AMOUNT :</td>
                        <td style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}>USD {total.toLocaleString()}</td>
                    </tr>
                </tbody>
            </table>

            {/* Flexible spacer - fills remaining page height for A4 form */}
            <div style={{ flex: 1 }} />

            {/* Shipping Marks + Signature */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '-1px' }}>
                <tbody>
                    <tr>
                        <td style={{ ...cell, width: '60%', verticalAlign: 'top', minHeight: '80px' }}>
                            <div style={{ borderBottom: '1px solid #000', width: '80px', marginBottom: '4px' }}></div>
                            <span style={label}>SHIPPING MARKS</span>
                            <EF v={doc.shipping_marks || ''} onChange={set('shipping_marks')} historyKey="shipping_marks" multiline isPrint={isPrint} />
                        </td>
                        <td style={{ ...cell, width: '40%', textAlign: 'center', verticalAlign: 'bottom', paddingBottom: '8px' }}>
                            <div style={{ marginBottom: '8px', fontStyle: 'italic', fontSize: '12px' }}>Signature</div>
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80px' }}>
                                {ceoSignature && (
                                    <img src={ceoSignature} alt="Signature" style={{ height: '120px', objectFit: 'contain' }} />
                                )}
                            </div>
                            <div style={{ borderTop: '1px solid #000', marginTop: '4px', paddingTop: '4px', fontSize: '11px' }}>
                                {companyName || 'Designmecha Co.,Ltd.'} / InHoCho
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default CommercialInvoiceTemplate;
