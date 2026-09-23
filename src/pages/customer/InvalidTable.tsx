export default function InvalidTable() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">🍽️</div>
        <h1 className="text-2xl font-bold text-gray-800">Table Not Available</h1>
        <p className="text-gray-600 mt-2">
          This QR code is invalid or inactive. Please contact restaurant staff.
        </p>
      </div>
    </div>
  );
}
