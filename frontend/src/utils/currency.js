/**
 * currency.js — 다중 통화(KRW/USD) 유틸리티
 */

/**
 * 금액을 통화 기호 포함 문자열로 포맷
 * @param {number} amount
 * @param {string} currency 'KRW' | 'USD'
 * @returns {string}  예: "₩ 12,500" / "$ 9.50"
 */
export const formatCurrency = (amount, currency = 'KRW') => {
  if (amount === null || amount === undefined) return '-';
  const num = Number(amount);
  if (isNaN(num)) return '-';
  if (currency === 'USD') {
    return `$ ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₩ ${Math.round(num).toLocaleString('ko-KR')}`;
};

/**
 * 달러를 원화로 환산 (이미 KRW면 그대로)
 * @param {number} amount
 * @param {string} currency
 * @param {number} exchangeRate  1 USD = N KRW
 * @returns {number}
 */
export const toKRW = (amount, currency, exchangeRate) => {
  if (currency === 'USD') return Number(amount) * Number(exchangeRate);
  return Number(amount);
};

/**
 * 품목 목록을 순회하여 KRW/USD 합계 계산
 * @param {Array} items  각 요소에 amount(또는 unit_price*quantity), currency 포함
 * @param {string} amountKey  금액 필드명 (기본: 'total_amount')
 * @param {string} currencyKey  통화 필드명 (기본: 'currency')
 * @returns {{ krw: number, usd: number }}
 */
export const sumByCurrency = (items, amountKey = 'total_amount', currencyKey = 'currency') => {
  return (items || []).reduce(
    (acc, item) => {
      const amt = Number(item[amountKey] ?? 0);
      if ((item[currencyKey] ?? 'KRW') === 'USD') acc.usd += amt;
      else acc.krw += amt;
      return acc;
    },
    { krw: 0, usd: 0 }
  );
};

/**
 * 통화 선택 드롭다운 컴포넌트
 * @param {{ value: string, onChange: function, className?: string }} props
 */
export function CurrencySelect({ value, onChange, className = '' }) {
  return (
    <select
      value={value ?? 'KRW'}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 ${className}`}
    >
      <option value="KRW">₩ 원화</option>
      <option value="USD">$ 달러</option>
    </select>
  );
}
