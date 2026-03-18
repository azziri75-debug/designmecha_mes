import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import PurchaseOrderTemplate from './PurchaseOrderTemplate';

const PurchaseOrderForm = ({ data, onChange, isReadOnly, currentUser, documentData }) => {
    const [company, setCompany] = useState(null);

    useEffect(() => {
        fetchCompany();
    }, []);

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (err) {
            console.error('Failed to fetch company', err);
        }
    };

    // Initialize items if empty
    useEffect(() => {
        if (typeof onChange !== 'function') return;
        if (!data.items || data.items.length === 0) {
            const defaultItems = Array(10).fill({ idx: "", name: "", spec: "", qty: "", price: "", total: "" });
            onChange('items', defaultItems);
        }
        if (!data.colWidths) {
            onChange('colWidths', [40, 200, 120, 60, 80, 100]);
        }
    }, [onChange]);

    return (
        <PurchaseOrderTemplate 
            data={data}
            onChange={onChange}
            isReadOnly={isReadOnly}
            currentUser={currentUser}
            documentData={documentData}
            company={company}
            className="min-h-[297mm] p-[10mm]"
        />
    );
};

export default PurchaseOrderForm;
