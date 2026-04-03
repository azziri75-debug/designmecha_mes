
const fs = require('fs');
const path = require('path');

const targetFile = path.join('d:', 'MES', 'frontend', 'src', 'pages', 'ProductsPage.jsx').replace(/\\\\/g, '/');
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Fix useEffect re-initialization
// Using a regex to find the problematic block starting with else if (detailSubTab === 'routing')
const effectRegex = /else if \\(detailSubTab === 'routing'\\) \\{\\s+const p = productFormData;\\s+const existing = \\(p\\.standard_processes \\|\\| \\\\[\\\\]\\)\\.map\\(proc => \\(\\{[\\s\\S]+?\\}\\)\\);\\s+setRoutingProcesses\\(existing\\);\\s+setSelectedProduct\\(p\\);\\s+\\}/;
const newEffect = `else if (detailSubTab === 'routing') {
                const p = productFormData;
                if (!routingProcesses || routingProcesses.length === 0) {
                    const existing = (p.standard_processes || []).map(proc => ({
                        process_id: proc.process_id, sequence: proc.sequence, estimated_time: proc.estimated_time, notes: proc.notes, partner_name: proc.partner_name, equipment_name: proc.equipment_name, attachment_file: proc.attachment_file, cost: proc.cost || 0, _tempId: Math.random()
                    }));
                    setRoutingProcesses(existing);
                    setSelectedProduct(p);
                }
            }`;

if (effectRegex.test(content)) {
    console.log("Match found for effect block");
    content = content.replace(effectRegex, newEffect);
} else {
    console.log("No match found for effect block regex");
}

// 2. Fix handleSaveRouting
const saveRegex = /await api\\.put\\(\\`\\/product\\/products\\/\\$\\{selectedProduct\\.id\\}\\`\\, payload\\);\\s+alert\\("공정 설정이 저장되었습니다\."\\);\\s+setShowProductModal\\(false\\);\\s+fetchProducts\\(\\);\\s+\\/\\/ Refresh list to update any view if needed\\s+\\} catch \\(error\\) \\{[\\s\\S]+?\\}/;
const newSave = `setLoading(true);
            await api.put(\`/product/products/\${selectedProduct.id}\`, payload);
            alert("공정 설정이 저장되었습니다.");
            setShowProductModal(false);
            fetchProducts();
        } catch (error) {
            console.error("Failed to save routing", error);
            alert("저장 실패: " + (error.response?.data?.detail || error.message));
        } finally {
            setLoading(false);
        }`;

if (saveRegex.test(content)) {
    console.log("Match found for save block");
    content = content.replace(saveRegex, newSave);
} else {
    console.log("No match found for save block regex");
}

// 3. Fix button
const buttonRegex = /<button\\s+onClick=\\{handleSaveRouting\\}\\s+className="px-6 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-900\\/40 flex items-center gap-2"\\s+>\\s+<Save className="w-4 h-4" \\/>\\s+공정 설정 저장\\s+<\\/button>/;
const newButton = `<button
                                    onClick={handleSaveRouting}
                                    disabled={loading}
                                    className={cn(
                                        "px-6 py-2 rounded-lg text-sm font-medium text-white transition-all shadow-lg flex items-center gap-2",
                                        loading ? "bg-gray-600 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40"
                                    )}
                                >
                                    <Save className="w-4 h-4" />
                                    {loading ? "저장 중..." : "공정 설정 저장"}
                                </button>`;

if (buttonRegex.test(content)) {
    console.log("Match found for button block");
    content = content.replace(buttonRegex, newButton);
} else {
    console.log("No match found for button block regex");
}

fs.writeFileSync(targetFile, content, 'utf8');
console.log("Transformation attempt finished");
