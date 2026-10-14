# Vistralo data processing addendum — DRAFT, NOT PUBLISHED

Operator Dynamix LTD, Mirpur 12, Eastern Housing, Road10, House 123, 2nd Floor, Dhaka 1216, Bangladesh · Website https://vistralo.com · Contact contact@vistralo.com · Version `{{VERSION_AND_DATE}}`

**Not approved. Do not publish, link or sign this until a lawyer has reviewed it and every `{{FIELD}}` is filled.** It is an original draft and is not legal advice. A data processing agreement has legal effect, and several clauses below depend on choices only counsel can make: which transfer mechanism applies to a processor established in Bangladesh, whether representatives in the EU and UK are required, and the liability terms. The draft sets out the facts of the processing so that review can start from something accurate.

## 1. When this addendum applies

It applies when a customer uses Vistralo to process personal data that the customer is responsible for under data protection law, for example recordings that show the customer's own users or staff. In that case the customer is the controller and Dynamix LTD ("Vistralo") is the processor. It forms part of the service terms. `{{HOW_IT_IS_ACCEPTED: BY REFERENCE IN THE TERMS, OR BY SIGNATURE}}`

It does not cover data for which Vistralo is itself the controller: the customer's account details, billing records and service logs. The Privacy Notice covers those.

## 2. What is processed

| | |
| --- | --- |
| Subject matter | Storing the customer's recordings, videos, screenshots and website captures, and turning them into narrated walkthroughs and Visual briefs |
| Duration | For as long as the customer has an account, and afterwards until deletion under section 9 |
| Nature and purpose | Storage; extracting still pictures; reading a public web page's code; sending pictures and text to OpenAI and HeyGen when the customer asks for narration, on Vistralo's accounts for plans that include it or on the customer's own accounts otherwise; producing audio and video; serving the result to the customer and to people who open a share link the customer created |
| Kinds of personal data | Whatever is visible or audible in what the customer records or uploads. Typically names, email addresses, profile pictures, messages and on-screen account details; voices in a talk-through. Vistralo does not ask for any category of data and does not classify what it receives |
| Special categories | None are requested. The customer must not record special-category data unless it has a lawful basis to and has assessed sending it to its AI providers. `{{COUNSEL}}` |
| People concerned | People who appear in the customer's recordings, uploads or captured pages |

## 3. Instructions

Vistralo processes this data only on the customer's documented instructions, which are these terms, this addendum and what the customer does in the app (creating a project, starting a job, creating or revoking a share link, deleting). If the law requires Vistralo to process the data in another way, Vistralo will tell the customer first unless the law forbids it. Vistralo will say so if it believes an instruction breaks data protection law.

## 4. Confidentiality

People authorised by Vistralo to handle this data are bound to keep it confidential. `{{HOW: CONTRACT, POLICY}}`

## 5. Security

Vistralo applies the measures described in the Security Overview, which is the technical and organisational measures annex to this addendum. `{{CONFIRM_THE_OVERVIEW_IS_FINAL_AND_SUFFICIENT_FOR_THIS_PURPOSE}}`

## 6. Other processors

The customer authorises Vistralo to use the companies listed in the first table of the Subprocessors page. Vistralo has a written agreement with each that imposes data protection obligations no weaker than this addendum, and remains responsible for what they do. `{{CONFIRM_AGREEMENTS_EXIST}}`

Vistralo will give notice of a new or replacement subprocessor `{{NOTICE_PERIOD}}` in advance by `{{CHANNEL}}`. The customer may object on reasonable data protection grounds within that period. `{{WHAT_HAPPENS_IF_THE_OBJECTION_CANNOT_BE_RESOLVED}}`

On plans that include AI narration (Pro and Studio), OpenAI and HeyGen are engaged by Vistralo under Vistralo's own accounts and are Vistralo's subprocessors. On Free, or when a customer saves their own keys, they are engaged by the customer under the customer's own accounts. Vistralo sends data to them only when the customer starts a job that needs it. `{{COUNSEL: CONFIRM THE TWO ROLES, AND ADD OPENAI AND HEYGEN TO THE AUTHORISED LIST FOR THE INCLUDED PLANS}}`

## 7. Requests from individuals

If someone asks Vistralo directly to access, correct or delete their data in a customer's content, Vistralo will pass the request to the customer and will not answer it on the customer's behalf. Vistralo will help the customer respond, as far as the nature of the processing allows. The customer can already delete any project, which removes its files. `{{WHETHER_HELP_BEYOND_THE_PRODUCT'S_OWN_FEATURES_IS_CHARGED}}`

## 8. Personal data breaches

Vistralo will tell the customer without undue delay, and in any case within `{{HOURS}}` hours, after becoming aware of a breach affecting this data. The notice will say what happened, what data and roughly how many people are affected as far as is known, and what is being done. `{{CONTACT_THE_NOTICE_IS_SENT_TO}}`

## 9. Deletion and return

Deleting a project from Trash removes its files from storage and its record from the database. On closing an account Vistralo deletes the customer's remaining content within `{{DAYS}}` days, except copies in backups, which are overwritten within `{{BACKUP_PERIOD}}`, and anything the law requires to be kept. Before closing, the customer can download each project's files from the app. `{{BULK_EXPORT_IF_BUILT}}`

## 10. Information and audits

Vistralo will give the customer the information reasonably needed to show that this addendum is being followed, and will allow an audit `{{FREQUENCY, NOTICE, CONFIDENTIALITY, COST AND WHETHER A WRITTEN QUESTIONNAIRE IS ACCEPTED FIRST}}`.

## 11. Transfers outside the customer's country

Vistralo is established in Bangladesh and its hosting providers are in `{{COUNTRIES}}`. Where the customer's data is subject to EU, UK or Swiss law, the parties rely on `{{TRANSFER_MECHANISM: FOR EXAMPLE THE EU STANDARD CONTRACTUAL CLAUSES, MODULE AND ANNEXES, AND THE UK ADDENDUM}}`. `{{EU_AND_UK_REPRESENTATIVES_IF_REQUIRED}}`

## 12. The customer's responsibilities

The customer is responsible for having a lawful basis to record and upload the data, for telling the people concerned, for choosing whether to send it to AI providers, and for who it gives share links to.

## 13. Liability and order of precedence

`{{COUNSEL}}` If this addendum and the service terms disagree about personal data, this addendum applies.

## Facts to check before publishing

1. Sections 2, 5, 6 and 9 against the product on the day: what is processed, the Security Overview, the subprocessor list, and that deleting a project does remove its files (`web/cloud.ts`, `remove`) including any poster image.
2. Backups: whether any exist outside Supabase's own, and how long they last.
3. That the team can meet the breach notice period in section 8 every time.
4. Whether working copies on the worker's server are deleted when a job ends, and what the worker's logs contain.
