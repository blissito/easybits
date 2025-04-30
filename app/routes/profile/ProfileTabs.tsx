import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { Fragment } from "react";
import {
  Notifications,
  ProfileCard,
  SuscriptionCard,
} from "./profileComponents";
import type { User } from "@prisma/client";
import type { Customer } from "aws-sdk/clients/connect";
import { cn } from "~/utils/cn";

export const ProfileTabs = ({
  user,
  plan,
  used,
  customer,
}: {
  used: number;
  plan?: string | null;
  user: User;
  customer: Customer;
}) => {
  return (
    <TabGroup className="mt-10">
      <TabList className="flex gap-3 md:gap-6 border-b-2 w-full max-w-2xl pb-4 px-2 border-black ">
        <Tab as={Fragment}>
          {({ hover, selected }) => (
            <button
              className={cn(
                "px-2 md:px-4 h-10 text-black border-2 border-white",
                { " border-black": hover },
                {
                  "bg-brand-500  border-black focus:outline-none": selected,
                }
              )}
            >
              General
            </button>
          )}
        </Tab>
        <Tab as={Fragment}>
          {({ hover, selected }) => (
            <button
              className={cn(
                "px-2 md:px-4 h-10 text-black border-2 border-white",
                { " border-black": hover },
                {
                  "bg-brand-500   border-black focus:outline-none": selected,
                }
              )}
            >
              Notificaciones
            </button>
          )}
        </Tab>
        <Tab as={Fragment}>
          {({ hover, selected }) => (
            <button
              className={cn(
                "px-2 md:px-4 h-10 text-black border-2 border-white",
                { " border-black": hover },
                {
                  "bg-brand-500   border-black focus:outline-none": selected,
                }
              )}
            >
              Integraciones
            </button>
          )}
        </Tab>
      </TabList>
      <TabPanels>
        <TabPanel>
          <ProfileCard user={user} />
          <SuscriptionCard used={used} customer={customer} plan={plan!} />
        </TabPanel>
        <TabPanel>
          <Notifications user={user} />{" "}
        </TabPanel>
        <TabPanel>Content 3</TabPanel>
      </TabPanels>
    </TabGroup>
  );
};
