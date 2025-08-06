import { XMarkIcon, PlusIcon, MinusIcon } from '@heroicons/react/24/outline';

interface AdjustQuantityModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: {
    product_name: string;
    branch: string;
    quantity: number;
  };
  isAdmin: boolean;
  quantity: number;
  setQuantity: (quantity: number) => void;
  handleApply: () => void;
  handleRemoveItem: () => void;
}

const AdjustQuantityModal: React.FC<AdjustQuantityModalProps> = ({
  isOpen,
  onClose,
  item,
  isAdmin,
  quantity,
  setQuantity,
  handleApply,
  handleRemoveItem,
}) => {
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Adjust Stock Quantity</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-500"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>
      <div className="mb-4">
        <h3 className="text-lg font-medium text-gray-900">{item.product_name}</h3>
        <p className="text-sm text-gray-500">Branch: {item.branch}</p>
        <p className="text-sm text-gray-500">Current Stock: {item.quantity}</p>
      </div>
      <div className="mb-4">
        <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
          New Quantity
        </label>
        <div className="mt-1 flex items-center">
          {isAdmin && (
            <button
              onClick={() => setQuantity(Math.max(0, quantity + 1))}
              className="p-2 border border-gray-300 rounded-l-md bg-gray-50 hover:bg-gray-100"
            >
              <PlusIcon className="h-5 w-5 text-gray-500" />
            </button>
          )}
          <input
            type="number"
            id="quantity"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            min="0"
            autoFocus
          />
          <button
            onClick={() => setQuantity(Math.max(0, quantity - 1))}
            className="p-2 border border-gray-300 rounded-r-md bg-gray-50 hover:bg-gray-100"
          >
            <MinusIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>
      </div>
      <div className="flex justify-end space-x-2">
        <button
          onClick={handleApply}
          className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Apply
        </button>
        <button
          onClick={handleRemoveItem}
          className="inline-flex justify-center rounded-md border border-transparent bg-red-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          Remove Item
        </button>
        <button
          onClick={onClose}
          className="inline-flex justify-center rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default AdjustQuantityModal; 