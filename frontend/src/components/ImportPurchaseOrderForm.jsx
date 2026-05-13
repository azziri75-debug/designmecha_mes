import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import ImportPurchaseOrderTemplate from './ImportPurchaseOrderTemplate';

const ImportPurchaseOrderForm = ({ data, onChange, isReadOnly, currentUser, documentData }) => {
    const [company, setCompany] = useState(null);

    useEffect(() => { fetchCompany(); }, []);

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (err) {
            console.error('Failed to fetch company', err);
        }
    };

    useEffect(() => {
        if (typeof onChange !== 'function') return;
        if (!data.items || data.items.length === 0) {
            onChange('items', Array(10).fill({ idx: '', name: '', spec: '', qty: '', price: '', total: '' }));
        }
        if (!data.colWidths) {
            onChange('colWidths', [40, 200, 180, 50, 80, 100]);
        }
    }, [onChange]);

    return (
        <ImportPurchaseOrderTemplate
            data={data}
            onChange={onChange}
            isReadOnly={isReadOnly}
            currentUser={currentUser}
            documentData={documentData}
            company={company}
            isRFQ={data.is_rfq || false}
            docType="IMPORT_PURCHASE_ORDER"
        />
    );
};

export default ImportPurchaseOrderForm;
