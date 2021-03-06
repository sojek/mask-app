import * as E from "fp-ts/es6/Either";
import * as O from "fp-ts/es6/Option";
import * as TE from "fp-ts/es6/TaskEither";
import * as R from "fp-ts/es6/Record";
import { pipe } from "fp-ts/es6/pipeable";
import { flow } from "fp-ts/es6/function";

import { ContactData, SummaryData, StepDict } from "./Step";
import { UsageType, Style, Material, Size, PrintType, Supplies, Brand, OrderPos } from "../Supply/Supply";
import { API_URL } from "@/common/api-url";

/* eslint-disable @typescript-eslint/no-empty-interface */
export type Necessitous = {
  [K in keyof Necessitous.Request]: Necessitous.Request[K];
}[keyof Necessitous.Request];

export namespace Necessitous {
  // TODO: use URL builder
  const necessitousPath = API_URL + "requests";

  // TODO: move supplies to Supply Module
  export type Request = Partial<{
    medicalCentre: Request.MedicalCentre;
    masks: Request.Mask;
    gloves: Request.Glove;
    groceries: Request.Grocery;
    disinfectionMeasures: Request.Disinfectant;
    suits: Request.Suite;
    otherCleaningMaterials: Request.Cleaning;
    psychologicalSupport: Request.PsychologicalSupport;
    sewingSupplies: Request.SewingSupplies;
    others: Request.Other;
    additionalComment: string;
    prints: Request.Print;
    transport: Request.Transport;
  }>;
  export namespace Request {
    export interface MedicalCentre {
      legalName: string;
      city: string;
      street: string;
      buildingNumber: string;
      apartmentNumber?: string;
      postalCode?: string;
      email: string;
      phoneNumber: string;
    }
    export const MedicalCentre = (d: ContactData): MedicalCentre => ({
      ...d,
      legalName: d.name,
      buildingNumber: d.building,
      apartmentNumber: d.apartment,
      phoneNumber: d.phone
    });

    type SupplyRequest<T> = { description?: string; positions: T[] };
    type CustomReqType = "Grocery" | "Disinfectant" | "Cleaning";
    type CustomTypeReq = SupplyRequest<{ quantity: number; description?: string }>;

    // TODO: refactor serialization, io-ts ?, move to supplies ?

    const nonEmptyCustomType = <T extends CustomReqType>() => (data: Supplies[T]) => {
      const positions = (data.positions as Supplies[CustomReqType]["positions"] extends Array<infer T> ? T[] : never)
        .map(a => ({ quantity: a.supply.quantity, description: a.supply.type }))
        .filter(a => a.quantity > 0);

      return positions.length > 0 ? O.some({ ...data, positions }) : O.none;
    };

    const nonEmpty = <A extends Brand, B>(fn: (data: Supplies[A]) => B) => (data: Supplies[A]) =>
      data.positions.length > 0 ? O.some(fn(data)) : O.none;

    const toReq = <A extends Brand, B extends SupplyRequest<any>>(data: Supplies[A]): B =>
      ({ ...data, positions: (data.positions as OrderPos).map(a => a.supply) } as B);

    const nonEmptyDesc = (desc?: string) =>
      pipe(
        desc,
        O.fromNullable,
        O.filter(d => d !== ""),
        O.map(d => ({ description: d }))
      );

    export type Mask = SupplyRequest<{ usageType: UsageType; quantity: number; style: Style }>;
    export const Mask = nonEmpty<"Mask", Mask>(data => ({
      ...data,
      positions: data.positions.map(a => ({ ...a.supply, usageType: a.supply.type }))
    }));

    export type Glove = SupplyRequest<{ material: Material; quantity: number; size: Size }>;
    export const Glove = nonEmpty<"Glove", Glove>(toReq);

    export type Grocery = CustomTypeReq;
    export const Grocery = nonEmptyCustomType<"Grocery">();

    export type Disinfectant = CustomTypeReq;
    export const Disinfectant = nonEmptyCustomType<"Disinfectant">();

    export type Cleaning = CustomTypeReq;
    export const Cleaning = nonEmptyCustomType<"Cleaning">();

    export type Suite = SupplyRequest<{ material?: Material; quantity: number; size: Size }>;
    export const Suite = nonEmpty<"Suit", Suite>(toReq);

    export type PsychologicalSupport = { description: string };
    export const PsychologicalSupport = (data: Supplies["PsychologicalSupport"]) => nonEmptyDesc(data.description);

    export type Other = { description: string };
    export const Other = (data: Supplies["Other"]) => nonEmptyDesc(data.description);

    export type Print = SupplyRequest<{ printType: PrintType; quantity: number }>;
    export const Print = nonEmpty<"Print", Print>(toReq);

    export type SewingSupplies = { description: string };
    export const SewingSupplies = (data: Supplies["SewingMaterial"]) => nonEmptyDesc(data.description);

    export type Transport = { description: string };
    export const Transport = (data: Supplies["Transport"]) => nonEmptyDesc(data.description);

    export type AdditionalComment = { description?: string };
    export const AdditionalComment = (data: SummaryData["comment"]) =>
      pipe(
        O.fromNullable(data),
        O.filter(d => d !== "")
      );

    export const fromAdditionalComment = (comment?: string) => ({
      additionalComment: pipe(comment, O.fromNullable, O.chain(Request.AdditionalComment))
    });

    // TODO: made Supply a custom Monad instance
    export const fromSupplies = (supplies: Partial<Supplies>) => ({
      masks: pipe(supplies.Mask, O.fromNullable, O.chain(Request.Mask)),
      gloves: pipe(supplies.Glove, O.fromNullable, O.chain(Request.Glove)),
      groceries: pipe(supplies.Grocery, O.fromNullable, O.chain(Request.Grocery)),
      disinfectionMeasures: pipe(supplies.Disinfectant, O.fromNullable, O.chain(Request.Disinfectant)),
      suits: pipe(supplies.Suit, O.fromNullable, O.chain(Request.Suite)),
      otherCleaningMaterials: pipe(supplies.Cleaning, O.fromNullable, O.chain(Request.Cleaning)),
      psychologicalSupport: pipe(supplies.PsychologicalSupport, O.fromNullable, O.chain(Request.PsychologicalSupport)),
      sewingSupplies: pipe(supplies.SewingMaterial, O.fromNullable, O.chain(Request.SewingSupplies)),
      prints: pipe(supplies.Print, O.fromNullable, O.chain(Request.Print)),
      others: pipe(supplies.Other, O.fromNullable, O.chain(Request.Other)),
      transport: pipe(supplies.Transport, O.fromNullable, O.chain(Request.Transport))
    });
  }

  export type Response = string;

  const isNotPartial = (steps: Partial<StepDict>): steps is StepDict =>
    !!(steps.Contact && steps.Demand && steps.Summary);
  const fromNonPartial = E.fromPredicate(isNotPartial, () => new Error("Partial request"));

  export const sender = <Req, Res>(req: Req, path: string, parse = true): TE.TaskEither<Error, Res> =>
    TE.tryCatchK(
      () =>
        fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req)
        }).then(res => (parse ? res.json() : res)),
      () => new Error("Failed to send the request")
    )();

  export const send = (req: Request) => sender<Request, Response>(req, necessitousPath);

  export const createRequest = flow(
    fromNonPartial,
    E.map(steps => {
      const request: Record<keyof Necessitous.Request, O.Option<Necessitous>> = {
        medicalCentre: O.some(Request.MedicalCentre(steps.Contact)),
        additionalComment: Request.AdditionalComment(steps.Summary.comment),
        ...Request.fromSupplies(steps.Demand.supplies)
      };

      return request;
    }),
    E.map(R.compact)
  );
}
