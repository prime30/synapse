import type { PolicyType } from './types';

const RETURN_TEMPLATE = `<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Return Eligibility</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">We accept returns within <strong>[RETURN_WINDOW_DAYS] days</strong> of delivery for items that are <strong>unopened and in their original packaging</strong>. To be eligible, the product must be in the same condition you received it — sealed, unused, and with all original tags intact.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">How to Return</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">To initiate a return, follow these steps:</p>
<ul style="margin-bottom: 16px; padding-left: 24px; color: #444;">
  <li style="margin-bottom: 6px; line-height: 1.5;">Email <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a> with your order number and reason for return.</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">We will send you a prepaid return shipping label within <strong>24 hours</strong>.</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">Pack the item securely in its original packaging and ship it back.</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">Once we receive and inspect the return, your refund will be processed within <strong>5–7 business days</strong>.</li>
</ul>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Refund Method</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">Refunds are issued to your <strong>original payment method</strong>. Please allow additional time for your bank or credit card provider to process the refund. Original shipping costs are <strong>non-refundable</strong>.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Exchanges</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">We offer exchanges for <strong>unopened items within [RETURN_WINDOW_DAYS] days</strong> of delivery. Exchanges are subject to availability. If the requested item is out of stock, we will issue a store credit.</p>

<p style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 14px; color: #888;">
  <em>Last updated: [CURRENT_DATE]</em><br>
  Questions? Contact us at <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a>
</p>`;

const PRIVACY_TEMPLATE = `<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Information We Collect</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">When you place an order or interact with our store, we may collect the following information:</p>
<ul style="margin-bottom: 16px; padding-left: 24px; color: #444;">
  <li style="margin-bottom: 6px; line-height: 1.5;">Name, email address, and phone number</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">Shipping and billing address</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">Payment information (processed securely by our payment providers)</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">Order history and product preferences</li>
</ul>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">How We Use Your Information</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">We use the information we collect to:</p>
<ul style="margin-bottom: 16px; padding-left: 24px; color: #444;">
  <li style="margin-bottom: 6px; line-height: 1.5;">Fulfill and ship your orders</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">Send marketing communications (only with your consent)</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">Respond to customer service inquiries</li>
  <li style="margin-bottom: 6px; line-height: 1.5;">Improve our products and website experience</li>
</ul>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Third-Party Services</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">We use trusted third-party services to operate our business, including <strong>Shopify</strong> (e-commerce platform), payment processors, and shipping carriers. These providers only access the data necessary to perform their services. <strong>We do not sell your personal data to anyone.</strong></p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Cookies</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">Our website uses cookies for analytics and, with your consent, marketing pixels to show you relevant ads. You can manage cookie preferences through your browser settings at any time.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Your Rights</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">You have the right to <strong>access, correct, or delete</strong> your personal information at any time. To exercise these rights, email us at <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a> and we will respond within 30 days.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Contact</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">If you have any questions about this Privacy Policy, contact us at:</p>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">
  <strong>[STORE_NAME]</strong><br>
  Email: <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a><br>
  Website: <a href="[STORE_URL]" style="color: #0066cc; text-decoration: underline;">[STORE_URL]</a>
</p>

<p style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 14px; color: #888;">
  <em>Last updated: [CURRENT_DATE]</em><br>
  Questions? Contact us at <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a>
</p>`;

const TERMS_TEMPLATE = `<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Acceptance of Terms</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">By accessing our website or placing an order with [STORE_NAME], you agree to be bound by these Terms of Service. If you do not agree to all of these terms, please do not use our site or purchase our products.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Products</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">We make every effort to display our products accurately. However, <strong>colors and dimensions may vary slightly</strong> from what appears on screen due to monitor settings and lighting differences. These slight variations are not considered defects.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Age Requirement</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">You must be <strong>18 years of age or older</strong> to make a purchase from [STORE_NAME]. By placing an order, you confirm that you meet this age requirement.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Intellectual Property</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">All content on this website — including text, images, logos, product photography, and branding — is the property of <strong>[STORE_NAME]</strong> and is protected by applicable intellectual property laws. You may not reproduce, distribute, or use any content without our written permission.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Limitation of Liability</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">[STORE_NAME] is <strong>not liable</strong> for any indirect, incidental, or consequential damages arising from the use of our products. Our total liability shall not exceed the purchase price of the product in question.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Governing Law</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">These Terms of Service are governed by and construed in accordance with the laws of the <strong>State of [YOUR_STATE]</strong>, without regard to conflict of law principles. Any disputes arising from these terms shall be resolved in the courts of the State of [YOUR_STATE].</p>

<p style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 14px; color: #888;">
  <em>Last updated: [CURRENT_DATE]</em><br>
  Questions? Contact us at <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a>
</p>`;

const SHIPPING_TEMPLATE = `<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Processing Time</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">Orders are processed within <strong>1–3 business days</strong> after payment is confirmed. Orders placed on weekends or holidays will begin processing the next business day.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Shipping Methods</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">We offer the following domestic shipping options:</p>
<ul style="margin-bottom: 16px; padding-left: 24px; color: #444;">
  <li style="margin-bottom: 6px; line-height: 1.5;"><strong>Standard Shipping:</strong> 3–5 business days after processing</li>
  <li style="margin-bottom: 6px; line-height: 1.5;"><strong>Priority Shipping:</strong> 2–3 business days after processing</li>
  <li style="margin-bottom: 6px; line-height: 1.5;"><strong>Expedited shipping:</strong> Available at checkout for faster delivery</li>
</ul>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">Delivery times are estimates and not guaranteed. Delays may occur due to carrier issues, weather, or high order volume.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">International Shipping</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">We ship internationally to select countries. International shipping rates and delivery times vary by destination and are calculated at checkout. <strong>Customers are responsible for all customs duties, taxes, and import fees</strong> imposed by their country. [STORE_NAME] is not responsible for delays caused by customs processing.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Order Tracking</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">A tracking number will be <strong>emailed to you</strong> as soon as your order ships. You can use this number to track your package through the carrier's website. If you do not receive a tracking email within 5 business days of placing your order, please contact us at <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a>.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Lost or Damaged Packages</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">If your package arrives damaged or does not arrive at all, please contact us within <strong>7 days</strong> of the expected delivery date at <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a>. Include your order number and any photos of damage. We will file a claim with the carrier and either <strong>reship your order or issue a full refund</strong>.</p>

<p style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 14px; color: #888;">
  <em>Last updated: [CURRENT_DATE]</em><br>
  Questions? Contact us at <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a>
</p>`;

const CONTACT_TEMPLATE = `<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Get in Touch</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">We'd love to hear from you! Whether you have a question about an order, need help choosing a product, or just want to say hi — reach out and we'll get back to you as soon as possible.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Email</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;"><a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a></p>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">We respond to all emails within <strong>24 hours</strong> during business hours.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Website</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;"><a href="[STORE_URL]" style="color: #0066cc; text-decoration: underline;">[STORE_URL]</a></p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Business Hours</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;"><strong>Monday – Friday:</strong> 9:00 AM – 5:00 PM EST</p>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">Emails received outside of business hours will be answered the next business day.</p>

<h2 style="font-size: 20px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #1a1a1a;">Returns &amp; Order Issues</h2>
<p style="margin-bottom: 12px; line-height: 1.6; color: #444;">For all return requests and order issues, please email <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a> and include your <strong>order number</strong> in all correspondence. This helps us locate your order quickly and resolve your issue faster.</p>

<p style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 14px; color: #888;">
  <em>Last updated: [CURRENT_DATE]</em><br>
  Questions? Contact us at <a href="mailto:[STORE_EMAIL]" style="color: #0066cc; text-decoration: underline;">[STORE_EMAIL]</a>
</p>`;

export const POLICY_TEMPLATES: Record<PolicyType, string> = {
  return: RETURN_TEMPLATE,
  privacy: PRIVACY_TEMPLATE,
  terms: TERMS_TEMPLATE,
  shipping: SHIPPING_TEMPLATE,
  contact: CONTACT_TEMPLATE,
};

export function getTemplate(type: PolicyType): string {
  return POLICY_TEMPLATES[type];
}
