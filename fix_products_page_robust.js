
const fs = require('fs');
const path = require('path');

const targetFile = 'd:/MES/frontend/src/pages/ProductsPage.jsx';
const lines = fs.readFileSync(targetFile, 'utf8').split(/\\r?\\n/);

// Fix useEffect (Lines 134-152 in current state)
// 134: } else if (detailSubTab === 'routing') { ... 
// Let's find the indices
const startEffect = 133; // Line 134 (0-indexed)
const endEffect = 154;   // Line 155 (0-indexed)

const newEffectLines = [
    "            } else if (detailSubTab === 'routing') {",
    "                const p = productFormData;",
    "                if (!routingProcesses || routingProcesses.length === 0) {",
    "                    const existing = (p.standard_processes || []).map(proc => ({",
    "                        process_id: proc.process_id,",
    "                        sequence: proc.sequence,",
    "                        estimated_time: proc.estimated_time,",
    "                        notes: proc.notes,",
    "                        partner_name: proc.partner_name,",
    "                        equipment_name: proc.equipment_name,",
    "                        attachment_file: proc.attachment_file,",
    "                        cost: proc.cost || 0,",
    "                        _tempId: Math.random()",
    "                    }));",
    "                    setRoutingProcesses(existing);",
    "                    setSelectedProduct(p);",
    "                }",
    "            } else if (detailSubTab === 'bom') {",
    "                fetchBomItems(productFormData.id);",
    "            }"
];

// Replace lines 134 to 155
lines.splice(133, 155-133+1, ...newEffectLines);

// Now fix handleSaveRouting
// Since we spliced, line numbers shifted. Let's search for "await api.put" 
let saveIndex = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('await api.put') && lines[i].includes('products')) {
        saveIndex = i;
        break;
    }
}

if (saveIndex !== -1) {
    // Current save block starts around saveIndex-3 to saveIndex+10
    // Actually, let's just find the start of the function and replace it.
    let funcStartIndex = -1;
    for (let i = saveIndex; i >= 0; i--) {
        if (lines[i].includes('handleSaveRouting = async () => {')) {
            funcStartIndex = i;
            break;
        }
    }
    
    let funcEndIndex = -1;
    for (let i = saveIndex; i < lines.length; i++) {
        if (lines[i].trim() === '};') {
            funcEndIndex = i;
            break;
        }
    }
    
    if (funcStartIndex !== -1 && funcEndIndex !== -1) {
        const newFuncLines = [
            "    const handleSaveRouting = async () => {",
            "        if (!selectedProduct) return;",
            "        try {",
            "            // Validate",
            "            const validProcesses = routingProcesses.filter(p => p.process_id);",
            "            if (validProcesses.length !== routingProcesses.length) {",
            "                alert(\"공정이 선택되지 않은 항목이 있습니다.\");",
            "                return;",
            "            }",
            "",
            "            const payload = {",
            "                standard_processes: validProcesses.map(p => ({",
            "                    process_id: parseInt(p.process_id),",
            "                    sequence: parseInt(p.sequence),",
            "                    estimated_time: parseFloat(p.estimated_time) || 0,",
            "                    notes: p.notes,",
            "                    partner_name: p.partner_name,",
            "                    equipment_name: p.equipment_name,",
            "                    attachment_file: p.attachment_file,",
            "                    cost: parseFloat(p.cost) || 0",
            "                }))",
            "            };",
            "",
            "            setLoading(true);",
            "            await api.put(`/product/products/${selectedProduct.id}`, payload);",
            "            alert(\"공정 설정이 저장되었습니다.\");",
            "            setShowProductModal(false);",
            "            fetchProducts();",
            "        } catch (error) {",
            "            console.error(\"Failed to save routing\", error);",
            "            alert(\"저장 실패: \" + (error.response?.data?.detail || error.message));",
            "        } finally {",
            "            setLoading(false);",
            "        }",
            "    };"
        ];
        lines.splice(funcStartIndex, funcEndIndex - funcStartIndex + 1, ...newFuncLines);
    }
}

// 3. Fix the button (onClick={handleSaveRouting})
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('onClick={handleSaveRouting}')) {
        // Line 1941 approx
        lines[i] = "                                    onClick={handleSaveRouting}"; // reset
        // The block is:
        // <button
        //     onClick={handleSaveRouting}
        //     className="..."
        // >
        //     ...
        // </button>
        
        // Let's find button start
        let btnStart = i;
        while (btnStart > 0 && !lines[btnStart].includes('<button')) btnStart--;
        
        let btnEnd = i;
        while (btnEnd < lines.length && !lines[btnEnd].includes('</button>')) btnEnd++;
        
        const newBtnLines = [
            "                                <button",
            "                                    onClick={handleSaveRouting}",
            "                                    disabled={loading}",
            "                                    className={cn(",
            "                                        \"px-6 py-2 rounded-lg text-sm font-medium text-white transition-all shadow-lg flex items-center gap-2\",",
            "                                        loading ? \"bg-gray-600 cursor-not-allowed\" : \"bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40\"",
            "                                    )}",
            "                                >",
            "                                    <Save className=\"w-4 h-4\" />",
            "                                    {loading ? \"저장 중...\" : \"공정 설정 저장\"}",
            "                                </button>"
        ];
        lines.splice(btnStart, btnEnd - btnStart + 1, ...newBtnLines);
        break; // only once
    }
}

fs.writeFileSync(targetFile, lines.join('\\n'), 'utf8');
console.log("Transformation based on logic/lines complete");
