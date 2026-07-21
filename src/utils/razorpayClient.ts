import Razorpay from 'razorpay';
import { config } from '../config/secrets';

let razorpay: Razorpay;

export function getRazorpay(): Razorpay {
    if (!razorpay) {
        razorpay = new Razorpay({
            key_id: config.razorpayKeyId,
            key_secret: config.razorpayKeySecret,
        });
    }
    return razorpay;
}
