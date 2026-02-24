const fs = require('fs');
const path = require('path');

// Fix ProductsPage.jsx - replace catch(_e) with bare catch
const productsPath = path.join(__dirname, 'frontend/src/pages/ProductsPage.jsx');
let src = fs.readFileSync(productsPath, 'utf8');
// Replace catch (_e) { and catch (_e){ with catch {
src = src.replace(/} catch \(_e\) \{/g, '} catch {');
src = src.replace(/\} catch\(_e\) \{/g, '} catch {');
const catchRemaining = (src.match(/catch \(_e\)/g) || []).length;
console.log('ProductsPage catch(_e) remaining:', catchRemaining);
fs.writeFileSync(productsPath, src, 'utf8');

// Fix BasicsPage.jsx - same issue
const basicsPath = path.join(__dirname, 'frontend/src/pages/BasicsPage.jsx');
let bsrc = fs.readFileSync(basicsPath, 'utf8');
bsrc = bsrc.replace(/} catch \(e\) \{/g, '} catch {');
bsrc = bsrc.replace(/} catch \(_e\) \{/g, '} catch {');
const bCatchRemaining = (bsrc.match(/catch \([e_]/g) || []).length;
console.log('BasicsPage catch(e) remaining:', bCatchRemaining);
fs.writeFileSync(basicsPath, bsrc, 'utf8');

console.log('Done!');
