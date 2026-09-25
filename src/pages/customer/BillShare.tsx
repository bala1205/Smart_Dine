import { useParams } from "react-router-dom";
import DigitalBill from "./Bill";
export default function BillShare() {
  const params = useParams();
  // Reuse DigitalBill; share route could have different handling but for now same
  return <DigitalBill key={params.orderId} />;
}
