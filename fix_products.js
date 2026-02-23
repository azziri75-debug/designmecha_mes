const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'frontend/src/pages/ProductsPage.jsx');
let src = fs.readFileSync(filePath, 'utf8');

// 1. Fix handleFileChange to JSON.stringify
src = src.replace(
    `            const url = await handleFileUpload(file);
            if (url) {
                setProductFormData(prev => ({ ...prev, drawing_file: url }));`,
    `            const fileData = await handleFileUpload(file);
            if (fileData) {
                setProductFormData(prev => ({ ...prev, drawing_file: JSON.stringify(fileData) }));`
);

// 2. Fix drawing_file display in modal
src = src.replace(
    `<span className="text-sm">{productFormData.drawing_file ? productFormData.drawing_file : "클릭하여 파일 업로드"}</span>`,
    `<span className="text-sm">{(() => {
                                                if (!productFormData.drawing_file) return "클릭하여 파일 업로드";
                                                try {
                                                    const parsed = typeof productFormData.drawing_file === 'string' ? JSON.parse(productFormData.drawing_file) : productFormData.drawing_file;
                                                    return parsed.name || "파일이 등록되었습니다";
                                                } catch(_e) {
                                                    return "파일이 등록되었습니다";
                                                }
                                            })()}</span>`
);

// 3. Replace remaining catch (e) with catch (_e)
src = src.replace(/} catch \(e\) \{/g, '} catch (_e) {');

// Verify
console.log('JSON.stringify fix:', src.includes('JSON.stringify(fileData)'));
console.log('catch(e) remaining:', (src.match(/catch \(e\)/g) || []).length);

fs.writeFileSync(filePath, src, 'utf8');
console.log('Done!');
