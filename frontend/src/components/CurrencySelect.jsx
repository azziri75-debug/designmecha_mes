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
