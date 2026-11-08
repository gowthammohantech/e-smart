/**
 * The legal and support pages. Drafts written from how the service works today, for a lawyer to
 * review: change the words here, and `draft: false` once a page is approved. The apps link to these
 * paths (packages/app/lib/legal.ts), and the store listings use the privacy and deletion pages.
 */
export type LegalDoc = {
  title: string;
  updated: string;
  draft: boolean;
  intro?: string;
  sections: { heading: string; paragraphs?: string[]; list?: string[] }[];
};

const COMPANY = 'Elixir Business Solutions India Pvt. Ltd.';
const ADDRESS = '7th Floor, KRM Center, 2 Harrington Road, Chetpet, Chennai 600031';
const EMAIL = 'contact@elixir-books.com';
const UPDATED = '2 November 2026';

export const privacy: LegalDoc = {
  title: 'Privacy policy',
  updated: UPDATED,
  draft: true,
  intro: `This policy explains what Elixir Books Smart (the mobile apps and the web app) collects, why, who processes it for us, how long we keep it, and the rights you have under the Digital Personal Data Protection Act, 2023. ${COMPANY} (“we”) is the data fiduciary.`,
  sections: [
    {
      heading: 'What we collect',
      list: [
        'Your account: name, email address, phone number, password (stored only as a one-way hash) and the language you use.',
        'Your business records: companies, branches, customers and suppliers (with their GSTINs, addresses, emails and phone numbers), items, invoices, payments, expenses, stock and the GST returns made from them.',
        'Files you attach: receipts, supplier bills and your logo.',
        'Logins to the GST e-invoice and e-way bill portals, if you enter them. They are encrypted and used only to file for you.',
        'Technical data: the devices you sign in from, their IP addresses, and when you were last active, so you can see and sign out your devices.',
      ],
    },
    {
      heading: 'What we don’t collect',
      paragraphs: ['We do not track you across other apps or websites, show advertising, sell your data, or collect your location or contacts.'],
    },
    {
      heading: 'Why we use it',
      list: [
        'To run the service you signed up for: keep your books, make invoices and returns, and file e-invoices and e-way bills you ask us to.',
        'To sign you in and keep your account secure, including codes sent by SMS or WhatsApp.',
        'To send what you ask us to send: invoices, reminders and receipts to your customers.',
        'To answer when you ask for help, and to bill you for a paid plan.',
      ],
    },
    {
      heading: 'Who processes it for us',
      paragraphs: ['These companies process data only to provide their part of the service, under contract with us:'],
      list: [
        'Railway: hosting and the database.',
        'Microsoft Azure or Amazon Web Services: storage of attached files and documents.',
        'An Indian SMS gateway (MSG91 or Pay4SMS) and Meta (WhatsApp): sign-in codes and the messages you send.',
        'An email provider (Resend, Azure Communication Services or Amazon SES): emails you send and account emails.',
        'A GST Suvidha Provider (Adaequare or Whitebooks), and the government IRP and e-way bill portals: e-invoices, e-way bills and GSTIN lookups you request.',
        'Razorpay: payment links you create and subscription payments.',
        'Anthropic: the questions you ask Lixi, the assistant, with the business data needed to answer them.',
      ],
    },
    {
      heading: 'How long we keep it',
      paragraphs: [
        'While your account is open, we keep your data so the service works.',
        'When you delete your account, your name, email, phone and logins are erased at once. If you were the only person on the account, it closes: your business records are kept, locked and unreadable to anyone, for 8 years, because GST law requires books of account to be kept for 72 months after the annual return is due. They are then erased.',
      ],
    },
    {
      heading: 'Your rights',
      list: [
        'See and correct your data in the app at any time.',
        'Export your books (Settings → Backup & export).',
        'Delete your account in the app (Settings → Your profile → Delete account), or ask us to (see Delete your account).',
        `Complain to us first, then to the Data Protection Board of India. Write to our Grievance Officer at ${EMAIL} (to be named before launch).`,
      ],
    },
    {
      heading: 'Security',
      paragraphs: [
        'Data is encrypted in transit (HTTPS). Passwords are hashed, portal logins are encrypted, platform staff need two-factor sign-in and every access they make to a business is logged. On your phone, sign-in tokens are kept in the system keychain.',
      ],
    },
    {
      heading: 'Contact',
      paragraphs: [`${COMPANY}, ${ADDRESS}. Email ${EMAIL}.`],
    },
  ],
};

export const terms: LegalDoc = {
  title: 'Terms of service',
  updated: UPDATED,
  draft: true,
  intro: `These terms are an agreement between you and ${COMPANY} for the use of Elixir Books Smart. By creating an account you accept them.`,
  sections: [
    {
      heading: 'The service',
      paragraphs: [
        'Elixir Books Smart lets a business keep its books, raise GST invoices, file e-invoices and e-way bills, and record payments, expenses and stock, on the web and on phones.',
        'You are responsible for the accuracy of what you record and file. The service helps you comply with GST law; it does not replace a chartered accountant’s advice, and filing to a government portal happens only when you ask for it.',
      ],
    },
    {
      heading: 'Your account',
      list: [
        'Keep your password and sign-in codes to yourself. You are responsible for what is done from your account and by the people you invite.',
        'The owner of a business decides who else can see and change it.',
        'You must be able to enter a contract under Indian law, and use the service for a lawful business.',
      ],
    },
    {
      heading: 'Plans and payment',
      paragraphs: [
        'The Free plan costs nothing. Paid plans, when offered, are billed in advance through Razorpay on the web and renew until cancelled; see the Refund policy. Plans are not sold in the mobile apps.',
      ],
    },
    {
      heading: 'Your data',
      paragraphs: ['Your business records belong to you. You can export them at any time. We handle them as the Privacy policy describes.'],
    },
    {
      heading: 'Acceptable use',
      list: ['No unlawful invoices, fake GST credits or impersonation of another business.', 'No attempts to break into the service, other accounts or the government portals through it.', 'No reselling of the service without our agreement.'],
    },
    {
      heading: 'Availability and liability',
      paragraphs: [
        'We work to keep the service available and your data safe, but it is provided as is. Government portals are outside our control and may be slow or down. To the extent the law allows, our liability is limited to the fees you paid in the 12 months before the claim.',
      ],
    },
    {
      heading: 'Ending',
      paragraphs: ['You can delete your account at any time. We may suspend an account that breaks these terms, after notice except where the law or security requires otherwise.'],
    },
    {
      heading: 'Law',
      paragraphs: ['These terms are governed by the laws of India, and the courts of Chennai have jurisdiction.'],
    },
  ],
};

export const refund: LegalDoc = {
  title: 'Refund and cancellation policy',
  updated: UPDATED,
  draft: true,
  sections: [
    {
      heading: 'Cancelling',
      paragraphs: ['You can cancel a paid plan at any time on the web, under Plan & billing. The plan stays active until the end of the period you paid for, then the business moves to the Free plan. Your records are kept.'],
    },
    {
      heading: 'Refunds',
      list: [
        'Payments are for a period in advance and are not refunded for the unused part of it, except where the law requires.',
        `A duplicate or wrong charge is refunded in full. Write to ${EMAIL} within 30 days of the charge.`,
        'Approved refunds go back to the original payment method within 7 working days of approval; your bank may take longer to show it.',
      ],
    },
    {
      heading: 'Deleting your account',
      paragraphs: ['Deleting your account cancels any paid plan at once, without a refund for the rest of the period.'],
    },
  ],
};

export const deleteAccount: LegalDoc = {
  title: 'Delete your account',
  updated: UPDATED,
  draft: false,
  intro: 'You can delete your Elixir Books Smart account yourself, in the app, at any time.',
  sections: [
    {
      heading: 'In the app',
      list: [
        'Open Settings → Your profile, then Delete account.',
        'Enter your password (or a code sent to your phone), type DELETE, and confirm.',
      ],
    },
    {
      heading: 'Can’t open the app?',
      paragraphs: [`Email ${EMAIL} from the address on your account with the subject “Delete my account”. We confirm it is you, then delete it within 7 days and reply when it’s done.`],
    },
    {
      heading: 'What is deleted, and what is kept',
      list: [
        'Deleted at once: your name, email address, phone number, password and sign-ins on every device.',
        'If other people use your business, make one of them an owner first (Settings → Users). The business carries on without you.',
        'If you were the only person on the account, it closes and any paid plan is cancelled. Your invoices and records are kept, locked and unreadable, for 8 years as GST law requires, then erased. Download a backup first if you will need them.',
      ],
    },
  ],
};

export const support: LegalDoc = {
  title: 'Support',
  updated: UPDATED,
  draft: false,
  intro: 'We’re here to help with the app, GST filing in it, and your account.',
  sections: [
    {
      heading: 'Contact us',
      list: [`Email: ${EMAIL} (we reply within one business hour, Monday to Saturday)`, 'Phone: +91 89256 33391, Monday to Saturday, 9:30am to 7pm IST', `Office: ${ADDRESS}`],
    },
    {
      heading: 'Before you write',
      list: ['The Cookbook on this site walks through every part of the app.', 'In the app, Lixi can answer questions about your own books.', 'Include your business name and the invoice or screen the question is about.'],
    },
  ],
};
