# Configuring Transitions

Configuration guide for transitions.

## General configuration

By default all transitions are disabled, to enable a transition modify the
`transitions` property on `ddoc.app_settings`.

### Enabling a transition

A transition is enabled if the value associated with its name is
[truthy](https://developer.mozilla.org/en-US/docs/Glossary/Truthy).

In both of these examples all three transitions are enabled:

```json
{
  "transitions": {
    "registrations": true,
    "default_responses": true,
    "update_clinics": true
  }
}
```

```json 
{
  "transitions": {
    "registrations": {
      "param": "val"
    },
    "default_responses": {},
    "update_clinics": {}
  }
}
```

### Disabling a transition

A transition is disabled if either the value associated with its name is [falsey](https://developer.mozilla.org/en-US/docs/Glossary/Falsy), or it has `"disable"` set to `true`, or the transition is missing.

In all three examples below the `registrations` transition is disabled.

```json
{
  "transitions": {}
}
```

```json
{
  "transitions": {
    "registrations": false
  }
}
```

```json
{
  "transitions": {
    "registrations": {
      "disable": true
    }
  }
}
```

## Specific transition configuration

TODO: fill out for each transition, even if there is no configuration for that transition.

### Generate_Patient_Id_On_Patients

No specific configuration

### Registration

TODO: Fill this out completely

#### Validations

TODO: Fill out all possible validation failures? Do we care about this or is it self-explanatory?

#### Triggers

TODO: Fill this out completely

##### add_patient_id

Identical to, and deprecated in favour of `add_patient`. 

##### add_patient

`param`'s:
 
You can define a different field that contains the patient's name as a single string, i.e. `"params": "name"`. The default field is `patient_name`.

You can also define and object containing multiple different parameters:
 - `patient_id` means that you do not want the system to generate a patient_id on a new registration, and instead you are going to provide one, at this field location. e.g., `"params": { "patient_id": "external_id" }`.
    - NB: This field **cannot** be called `patient_id`.
    - NB: This value must be unique among all registered patients in the system.
 - `patient_name`. Same rules as defined above as if it were a single string.
