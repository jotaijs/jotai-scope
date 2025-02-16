import { AnyAtom, AnyWritableAtom } from 'src/ScopeProvider/types'

export type ExtractAtomDefs<S extends string> = SplitAtoms<FirstNonemptyLine<S>>

type FirstNonemptyLine<S extends string> =
  S extends `${infer Line}\n${infer Rest}`
    ? Trim<Line> extends ''
      ? FirstNonemptyLine<Rest>
      : Trim<Line>
    : Trim<S>

type SplitAtoms<
  S extends string,
  Acc extends string[] = [],
> = S extends `${infer AtomDef},${infer Rest}`
  ? SplitAtoms<Rest, [...Acc, Trim<AtomDef>]>
  : S extends `${infer AtomDef}`
    ? [...Acc, Trim<AtomDef>]
    : Acc

type ScopeLines<S extends string> = S extends `${infer Line}\n${infer Rest}`
  ? Trim<Line> extends ''
    ? ScopeLines<Rest>
    : Rest
  : ''

export type ExtractScopes<S extends string> = SplitScopes<ScopeLines<S>>

type SplitScopes<
  S extends string,
  Acc extends string[] = [],
> = S extends `${infer Line}\n${infer Rest}`
  ? SplitScopes<Rest, [...Acc, ExtractScopeName<Line>]>
  : S extends `${infer Line}`
    ? [...Acc, ExtractScopeName<Line>]
    : Acc

type ExtractScopeName<S extends string> =
  S extends `${infer Name}[${string}]:${string}` ? Trim<Name> : never

type Trim<S extends string> = S extends ` ${infer T}` | `${infer T} `
  ? Trim<T>
  : S

type SplitDeps<
  S extends string,
  Acc extends string[] = [],
> = S extends `${infer Dep} + ${infer Rest}`
  ? SplitDeps<Rest, [...Acc, Trim<Dep>]>
  : S extends `${infer Dep}`
    ? [...Acc, Trim<Dep>]
    : Acc

type ParseAtomDef<S extends string> = S extends `${infer Name}(${infer Deps})`
  ? { name: Trim<Name>; deps: SplitDeps<Deps> }
  : { name: Trim<S>; deps: [] }

type AtomTypeFromDef<Def extends string> =
  ParseAtomDef<Def> extends {
    name: infer Name
    deps: infer Deps
  }
    ? {
        [K in Name & string]: Deps extends any[]
          ? Deps['length'] extends 0 | 1
            ? AnyWritableAtom
            : AnyAtom
          : never
      }
    : never

export type BuildAtomTypes<Defs extends string[], Result = {}> = Defs extends [
  infer Def,
  ...infer Rest,
]
  ? Rest extends string[]
    ? BuildAtomTypes<Rest, Result & AtomTypeFromDef<Def & string>>
    : never
  : Result
