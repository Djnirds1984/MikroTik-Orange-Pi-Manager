import React from 'react';
import type { SaleRecord } from '../types.ts';

interface PrintableReceiptProps {
  sale: SaleRecord | null;
}

export const PrintableReceipt: React.FC<PrintableReceiptProps> = ({ sale }) => {
  if (!sale) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: sale.currency,
    }).format(amount);
  };

  return (
    <div className="font-sans text-xs text-black bg-white p-2 w-[288px]"> {/* 80mm thermal paper width approx */}
      <style>
        {`
          @page {
            size: 80mm auto;
            margin: 2mm;
          }
        `}
      </style>
      <h1 className="text-center text-lg font-bold mb-2">PAYMENT RECEIPT</h1>
      <p className="text-center text-sm mb-4">MikroTik ISP Services</p>
      
      <div className="border-t border-b border-dashed border-black py-2 my-2">
        <p><strong>Date:</strong> {new Date(sale.date).toLocaleString()}</p>
        <p><strong>Receipt ID:</strong> {sale.id.split('_')[1]}</p>
        <p><strong>Router:</strong> {sale.routerName}</p>
        <p><strong>Client:</strong> {sale.clientName}</p>
      </div>

      <table className="w-full my-2">
        <thead>
          <tr>
            <th className="text-left">Description</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={2}><hr className="border-t border-dashed border-black my-1"/></td>
          </tr>
          <tr>
            <td>{sale.planName}</td>
            <td className="text-right">{formatCurrency(sale.planPrice)}</td>
          </tr>
           <tr>
            <td>Discount</td>
            <td className="text-right">-{formatCurrency(sale.discountAmount)}</td>
          </tr>
           <tr>
            <td colSpan={2}><hr className="border-t border-solid border-black my-1"/></td>
          </tr>
          <tr className="font-bold text-sm">
            <td>TOTAL</td>
            <td className="text-right">{formatCurrency(sale.finalAmount)}</td>
          </tr>
        </tbody>
      </table>
      
      <p className="text-center mt-4">Thank you for your payment!</p>
    </div>
  );
};
