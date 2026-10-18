import { UserCronsSection } from "~/components/admin/UserCronsSection";

// Crons de usuario para cualquier cuenta: lo mismo que /api/v2/crons, las tools *_cron y
// `easybits crons`. La sección habla con la REST usando la sesión del panel.

export const meta = () => [
  { title: "Crons — EasyBits" },
  { name: "robots", content: "noindex" },
];

export default function DeveloperCrons() {
  return (
    <div className="-mt-10">
      <UserCronsSection />
    </div>
  );
}
