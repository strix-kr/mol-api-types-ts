import Moleculer from "moleculer";

declare namespace APIGateway {

  namespace UnderlyingService {

    /* Service schema of underlying service. */
    interface ServiceSchema extends Moleculer.ServiceSchema {
      metadata?: {
        api?: APIConfig

        // internally calculated to compare api configuration among same services.
        apiVersion?: string

        // optional git repository URL for issue tracking
        repository?: string

        // optional description
        description?: string
      } & Moleculer.GenericObject

      // internal usage to report stdout of vm function to origin service
      $console?: { log: Function, warn: Function, info: Function, error: Function, errorWithoutPropagation: Function }

      // override for type hinting
      actions?:  { [key: string]: Action | ActionHandler }
      events?: { [key: string]: ServiceEvent | ServiceEventHandler }
    }

    /* Service actions can be published with api configurations in metadata. */
    interface APIConfig {
      rest?: RESTConfig
      graphql?: GraphQLConfig
      guard?: GuardConfig
    }

    /* Configuration to map service actions to REST endpoints. */
    interface RESTConfig {
      description?: string

      /*
        path: Optional root path for underlying service.

        If service name is "iam.user" and "/users" is given as path, "/users/*" will be routed for the service.
        otherwise, "/iam/user/*" will be routed for the service endpoints.
      */
      path?: string

      /*
        aliases: Map actions to REST endpoint. All available alias methods are GET|HEAD|PUT|PATCH|POST|DELETE|(all for empty).

        "POST login": "iam.user.issueToken"
        => POST /users/login        => iam.user.issueToken

        "POST /": "iam.user.create"
        => POST /users              => iam.user.create

        "GET /:id": "iam.user.get"
        => GET /users/:id           => iam.user.get
           :id param will be used to call iam.user.get action.
           Also any params from query string will be merged into the params to call the action.

        "REST /": "iam.user"
        => GET    /users            => iam.user.list
           GET    /users/:id        => iam.user.get
           POST   /users            => iam.user.create
           PUT    /users            => iam.user.update
           DELETE /users/:id        => iam.user.remove
      */
      aliases: {
        [alias: string]: RESTAliasConfig
      }
    }

    /* REST alias mapping configuration. */
    interface RESTAliasConfig {
      description?: string

      /*
        action: The name of moleculer action to map to REST alias.
       */
      action: string

      /*
        params: Params key/value map to call the given action.
        All mapping policies except 'Request context mapping' will be implicitly tried among same named params without explicit configuration.

        Mapping policies ordered by priority:

          1) Manual value mapping.
          Any values can be mapped manually.
          Useful to protect internal variables from being mapped implicitly.

          "GET /": {
            action: "iam.user.list",
            params: {
              withDisabled: false,
              options: {
                limit: 10,
              }
            }
          }

          2) URL path mapping.
          Aliased URL paths will be mapped.
          Be noted that the type of path values will be always string.

          "GET /:id": {
            action: "iam.user.get",
            params: {
              id: "$.id"
            }
          }

          3) Request body mapping.
          Parsed JSON of request body will be mapped.
          Same named object param from (3) will be recursively merged with (1) Manual value.

          "POST /:id": {
            action: "iam.user.create",
            params: {
              payload: "@.user",
              options: "@.opts"
            }
          }

          4) URL query string mapping.
          Parsed URL query string will be mapped.
            - URL can be extended like "obj[x]=1&obj[y]=2&arr[]=abc&arr[]=def".
            - Be noted that the type of query string values will be always string.
          Same named object param from (4) will be recursively merged with (1) Manual value.

          "GET /:id": {
            action: "iam.user.get",
            params: {
              options: "@.opts",
              order: "@.order",
            }
          }

        Type casting:

          Any string value of URL path and query string can be casted to boolean|number types.

          "GET /:id": {
            action: "iam.user.get",
            params: {
              id: "$.id:number",
              withDisabled: "@.disabled:boolean"
            }
          }

          Above configuration will make params like { id: 123, withDisabled: true }

       */
      params?: { [paramName: string]: any }
    }

    /* Configuration to extends GraphQL schema and map service actions to GraphQL schema resolver. */
    interface GraphQLConfig {
      description?: string

      /*
        typeDefs: Either a string or strings which defines the GraphQL schema for the service.

        `
        extend Query {
          user(id: ID!) User!
        }

        type User {
          id: ID!
          email: String!
          posts: [Post!]!
        }

        extend type Post {
           author: User
        }
        `
      */
      typeDefs: string

      /*
        resolvers: Defines the ways to resolve the given schema.

        Query: {
          user: { ... },
          ...
        },

        User: {
          posts: { ... },
          ...
        }
       */
      resolvers: {
        [typeName: string]: {
          // see below for detail of configuration
          [fieldName: string]: GraphQLObjectResolverConfig | GraphQLObjectResolverFnString | GraphQLSubscriptionResolverConfig

          /* __isTypeOf:
             ref: https://graphql-dotnet.github.io/docs/getting-started/interfaces/#resolvetype
          */
          __isTypeOf?: GraphQLObjectResolverConfig | GraphQLObjectResolverFnString

          /*
            __resolveType:
            ref: https://graphql-dotnet.github.io/docs/getting-started/interfaces/#resolvetype
          */
          __resolveType?: GraphQLObjectResolverConfig | GraphQLObjectResolverFnString

          /*
          __resolveNode: Optionally define the ways to resolve 'node(id: "urn:type-name:id-of-type"): Node!' query for the types which implement Node interface.
          "@id" will be mapped with "id-of-type" part in URN string.

          eg.

          File: {
            ...
            __resolveNode: {
              action: "file.get",
              params: {
                id: "@.id",
              },
            }
          }
         */
          __resolveNode?: GraphQLObjectResolverConfig
        }
      },
    }

    export type GraphQLResolveInfo = import("graphql").GraphQLResolveInfo;


    /* GraphQL resolver mapping configuration. */
    interface GraphQLObjectResolverConfig {
      description?: string

      /*
        action: The name of moleculer action to map to resolver.
       */
      action: string

      /*
        params: Params key/value map to call the given action.
        All mapping policies except 'Request context mapping' will be implicitly tried among same named params without explicit configuration.

        Mapping policies ordered by priority:

          1) Manual value mapping.
          Any values can be mapped manually.
          Useful to protect internal variables from being mapped implicitly.

          Mutation: {
            createMyUser: {
              action: "iam.user.create",
              params: {
                input: {
                  phone: null,
                  disabled: false,
                  isAdmin: false,
                  my: {
                    role: "member",
                    settings: {
                      notification: false
                    },
                  }
                },
              },
            },
          }

          2) Request context mapping.
          The APIRequestContext (from authentication header, etc.) will be mapped.
          Same named object param from (2) will be recursively merged with (1) Manual value.

          Query: {
            myPost: {
              action: "posts.get",
              params: {
                userId: "#.user.id"
              },
            },
          }

          3) Field arguments mapping.
          The field arguments (from request variables) will be mapped.
          Same named object param from (2) will be recursively merged with (1) Manual value.

          Mutation: {
            createMyUser: {
              action: "iam.user.create",
              params: {
                input: "@.input"
              },
            },
          }

          4) Source object mapping.
          The property of source object will be mapped.
          Same named object param from (3) will be recursively merged with (1) Manual value.

          User: {
            posts: {
              action: "post.list",
              params: {
                userId: "$.id"
              },
            },
          }

          Above configuration will make params like { userId: 'if of the source user object' }
       */
      params?: { [paramName: string]: any }

      /*
        batchedParams: If any param names given, API Gateway will use the batch loader (GraphQL DataLoader) to resolve the given field.
        In this case, the mapped action should be able to serve the request with batched params.

        "Query.user": {
          action: "iam.user.get",
          params: {
            id: "@.id"
          }
          batchedParams: ["id"]
        }

        Then "iam.user.get" action should be able to serve the request with { id: ["user-1", "user-2", ...] } params.
        Which means iam.user.get({ id: ["user-1", "user-2", "user-3"]}) should returns:

        [
          { id: "user-1", ... },
          { id: "user-2", ... },
          { id: "user-3", ... },
        ]

        And the action handler won't throw errors for the several entries with error, because it will make all entries failed.
        Instead of throwing error, handler should returns:

        [
          { id: "user-1", ... },
          { code: 404, code: "USER_NOT_FOUND", blabla..., ... batchError: true },
          { id: "user-3", ... },
        ]

        As above, any entries with error should be an object which contains "batchError: true" field.
        If not the entry will not be considered as an error.


        Below is another example.

        "User.post": {
          action: "post.get",
          params: {
            userId: "$.id"
          },
          batchedParams: ["userId"]
        }

        In above example, "post.get" action should be able to serve { userId: ["user-1", "user-2", ...] } params.
       */
      batchedParams?: string[]

      /*
        ignoreError: If true, "null" will be returned on error. Not affected on non-nullable fields.
       */
      ignoreError?: boolean
    }

    interface GraphQLBatchError {
      batchError: true
      [key: string]: any
    }


    /* GraphQLObjectResolverFnString:

      For the performance's sake, API GraphQL metadata can publish object field resolver as a string which denotes a JavaScript function.
      Be noted that only object field resolvers can be mapped in this way neither the subscription nor node resolver.


      GraphQLObjectResolverFn:

      Parsed GraphQLObjectResolverFnString should respect GraphQLObjectResolverFn interface.


      eg.


      * Use Function toString() method

      simpleField: (
        (source, args, context, info) => {
          source.otherField + "some simple task in resolver function";
        }
      ).toString(),


      * With TypeScript type hints

      simpleField: ((
        (source, args, context, info) => {
          return source.otherField + "some simple task in resolver function";
        }
      ) as GraphQLObjectResolverFn).toString(),


      * Just as primitive string

      simpleField: `(source, args, context, info) => source.otherField + "some simple task in resolver function")`,


      * Better to map actions for complex field

      complexField: {
        action: "my.service.do.something",
        params: {
          field1: "$.whateverFromSource",
          field2: "@.anythingFromFieldArgs",
          field3: "#.fromContextAsWell"
        },
      }


      * Be noted that special field __isTypeOf got only three arguments
      ref: https://graphql-dotnet.github.io/docs/getting-started/interfaces/#istypeof

      __isTypeOf: ((
        (source, context, info) => {
          return source.someSpecialFieldForThisType != null;
        }
      ) as GraphQLObjectResolver__Fn).toString(),


      * Be noted that special field __resolveType for Interfaces got only three arguments
      ref: https://graphql-dotnet.github.io/docs/getting-started/interfaces/#resolvetype

      __resolveType: ((
        (source, context, info) => {
          if (source.someSpecialFieldForThisType != null) {
            return "SpecialType";
          } else {
            ...
          }
        }
      ) as GraphQLObjectResolver__Fn).toString(),

    */
    export type GraphQLObjectResolverFnString = string;
    export type GraphQLObjectResolverFn<S = any, A = any> = (source: S, args: A, context: GraphQLRequestContext, info: GraphQLResolveInfo) => any;
    export type GraphQLObjectResolver__Fn<S = any> = (source: S, context: GraphQLRequestContext, info: GraphQLResolveInfo) => any;

    export type MatchFn = (name: string, pattern: string) => boolean

    interface GraphQLSubscriptionResolverConfig {
      description?: string

      /*
        events: The pattern of moleculer event name(s) to subscribe.
        eg. api.**, user.created, user.**, *.created
       */
      events: string[]

      /*
        filter: Optionally determine whether to publish given event or not.
        if the filter is not given, resolver will always publish events.

        GraphQLSubscriptionFilterFnString: a string which denotes a JavaScript function returning boolean which determines whether to publish given event or not.
        GraphQLSubscriptionFilterFn: Parsed GraphQLSubscriptionFilterFnString should respect GraphQLSubscriptionFilterFn interface.

        eg.

        filter: ((
          (source, args, context, info, match) => {
            switch (source.event) {
              case "user.updated":
                return source.payload.id == context.user.id;
              break;
              default:
                return false;
            }
          }
        ) as UnderlyingService.GraphQLSubscriptionFilterFn).toString(),
       */
      filter?: GraphQLSubscriptionFilterFnString

      /*
        action: The name of moleculer action to call with event payload.

        if the action is not given, resolver will just return "{ event, payload }: GraphQLSubscriptionSource" object.
       */
      action?: string

      /*
        params: Params key/value map to call the given action.

        The mapping mechanism is same with regular resolver.
        But the params "source object"($) notation will be mapped with "{ event, payload }: GraphQLSubscriptionSource" object.

        eg.

        Subscription: {
          notification: {
            event: "noti.sent",
            action: "noti.get",
            params: {
              id: "$.payload.id",
            },
          }
        }

        somewhere, an event has been emitted as like:

        this.broker.broadcast("noti.sent", { id: "xxx" })


        then the "Subscription.notification" resolver will call "noti.get" with { id: "xxx" } params.
       */
      params?: { [paramName: string]: any }

      ignoreError?: boolean
    }

    interface GraphQLSubscriptionSource<S = any> {
      event: string
      payload: S
      nodeID: string
    }

    export type GraphQLSubscriptionFilterFnString = string;
    export type GraphQLSubscriptionFilterFn<S = any, A = any> = (source: GraphQLSubscriptionSource<S>, args: A, context: GraphQLRequestContext, info: GraphQLResolveInfo, match: MatchFn) => boolean;


    /* File from multipart/form-data (REST, GraphQL both) content will be parsed as MultipartFile object in params */
    interface MultipartFile {
      name: string
      buffer: string
      encoding: string
      contentType: string
    }


    /* Service action would get below 'meta' from api gateway. */
    interface ActionContextMeta extends Moleculer.GenericObject {
      api: APIRequestContext
    }

    interface APIRequestContext {
      /* Authenticated user */
      user: any

      /* Authenticated admin (Google Suite organization users) */
      admin: any

      /* Locale */
      locale: string

      /*
        REST request information:

        This field would be filled when action called via REST endpoint.
      */
      rest: {
        headers: { [key: string]: any }
        cookies: { [key: string]: any }
        $response?: RESTResponseConfig
      }

      /*
        GraphQL request information:

        This field would be filled when action called via GraphQL schema.
        And will be filled as "true" before API gateway send the response.
      */
      graphql?: {
        source: any
        args: any
        context: GraphQLRequestContext
        info: GraphQLResolveInfo
      } | true
    }

    /* Configuration to guard service actions against API request context. */
    interface GuardConfig {
      /*
        action: The pattern of moleculer action name to guard call against API request context.
        eg. user.create, user.update, user.*.get, user.**

        ActionGuardFnString: a string which denotes a JavaScript function returning boolean which determines whether to invoke the action or not.
        ActionGuardFn: Parsed ActionGuardFnString should respect ActionGuardFn interface.

        eg.

        * Use Function toString() method

        "user.delete": ((action, params, context) => params.id == context.user.id).toString(),


        * With TypeScript type hints

        "user.delete": ((
          (action, params, context) => {
            return params.id == context.user.id
          }
        ) as UnderlyingService.ActionGuardFn).toString(),


        * With action pattern

        "user.**": ((
          (action, params, context, match) => {
            switch (action) {
              case "user.create":
                // ...
              default:
                if (match(action, "user.important.**")) {
                  // ...
                }
                // ...
            }
          }
        ) as UnderlyingService.ActionGuardFn).toString(),


        * With "call" method
        The last argument is "call" method of Molculer context.

        "user.get": ((async (action, params, context, match, call) {
          const result = await call("any.client.action", { something: context.user && context.user.any && context.user.any,thing })

          if (result) {
            // ...
          }

          return !!(context.admin || context.user && context.user.id == params.id || context.user.email == params.email);
        }) as UnderlyingService.ActionGuardFn).toString(),

        Be noted that non-idempotent actions which contains sort of data manipulation logic should not be called in guard.
        And when call argument is bound to guard (which means guard function receives "five" arguments),
        the guard result will not be cached (actually cached for 2.5s), it will degrade operation performance significantly.
      */
      [actionPattern: string]: ActionGuardFnString
    }

    export type ActionGuardFnString = string;
    export type ActionGuardFn<P = any> = (action: string, params: P, context: APIRequestContext, match: MatchFn, call: Moleculer.Context["call"]) => Promise<boolean>|boolean;


    /*
      HTTP response transformation:

      To transform HTTP response of API Gateway, assign 'ctx.meta.rest' field in action handler.
      This transformation will not be applied when action called via GraphQL schema.
      Be noted that when the action has been called via GraphQL resolver, 'rest' will be override by API Gateway GraphQL service.

      eg. from action definition.

      handler({ meta }) {
        if (meta.rest) {
          // 1) make a redirect response.
          meta.rest.$response = {
            statusCode: 301,
            headers: {
              "Location": "https://google.com",
            },
          };
          return;

          // 2) make a download response.
          meta.rest.$response = {
            headers: {
              "Content-Disposition": "attachment; filename=\"anyFile.pdf\"",
            },
          };
          return fileStream; // ref: https://moleculer.services/docs/0.13/actions.html#Streaming

          // 3) make a HTML document response.
          meta.rest.$response = {
            headers: {
              "Content-Type": "text/html",
            },
          };
          return "<html>....</html>";
        }

        // ...
      }
    */
    interface RESTResponseConfig {
      headers?: { [key: string]: string }
      statusCode?: number
      statusMessage?: string
    }

    // internal usage (it wraps APIRequestContext)
    interface GraphQLRequestContext extends Exclude<APIRequestContext, "graphql"> {
      _moleculerContext: Moleculer.Context
      _dataloaders: any
      _extensionStack?: any
    }

    // internal usage (it wraps GraphQLRequestContext)
    interface GraphQLSubscriptionRequestContext {
      connection: {
        context: GraphQLRequestContext
        [key: string]: any
      }
      [key: string]: any
    }

    // internal/client-side usage
    interface GraphQLWebSocketConnectionParams {
      authorization?: string
      admin?: string
    }

    interface Action extends Moleculer.Action {
      handler?: ActionHandler
      description?: string          // for documentation (markdown support)
      stream?: boolean              // for documentation
      meta?: Moleculer.ActionParams // for documentation
    }

    type ActionHandler<T = any> = ((ctx: Moleculer.Context<Moleculer.GenericObject, ActionContextMeta>) => PromiseLike<T> | T) & ThisType<Moleculer.Service>;

    interface ServiceEvent extends Moleculer.ServiceEvent {
      description?: string;
    }

    type ServiceEventHandler = ((payload: any, sender: string, eventName: string) => void) & ThisType<Moleculer.Service>;
  }

  // internal usage
  interface APISyncRequest extends Moleculer.GenericObject {
    services: UnderlyingService.ServiceSchema[]
    httpServer: import("http").Server
    shouldCallFixedNode: boolean
  }

  namespace CatalogService {
    /*
      Subscribe reports from API Gateway:

      Subscribe to 'api.catalog.report.<serviceName>' to get messages form API Gateway.

      eg. from service schema.

      events: {
        // listen to messages from API Gateway toward this service
        "api.catalog.report.<serviceName>"(report: CatalogService.ServiceReport) {
          if (report.serviceNodeID == this.broker.nodeID) {
            this.logger[report.type || "info"](`[Gateway@${report.gatewayNodeID} => ${report.serviceName}@${report.serviceNodeID}]`, JSON.stringify(report.messages, null, 2));
          }
        },

        // listen to related service messages
        "api.catalog.report.<serviceName>**"(report: CatalogService.ServiceReport) {
          // ...
        },

        // listen to all the messages from API Gateway
        "api.catalog.report.**"(report: CatalogService.ServiceReport) {
          // ...
        },

        // listen to api gateway status messages
        "api.catalog.report.api"(report: CatalogService.ServiceReport) {
          this.logger[report.type || "error"](`[Gateway@${report.gatewayNodeID} => ${report.serviceName}@${report.serviceNodeID}]`, JSON.stringify(report.messages, null, 2));
        },

        // listen to api gateway GraphQL server related messages
        "api.catalog.report.api.graphql"(report: CatalogService.ServiceReport) {
          this.logger[report.type || "error"](`[Gateway@${report.gatewayNodeID} => ${report.serviceName}@${report.serviceNodeID}]`, JSON.stringify(report.messages, null, 2));
        },

        // listen to both
        "api.catalog.report.api**"(report: CatalogService.ServiceReport) {
          // ...
        },
      },
    */
    interface ServiceReport {
      serviceName: string
      serviceNodeID?: string // if omitted, it is broadcast
      gatewayNodeID: string
      type: "warn" | "info" | "error"
      messages: any[]
      createdAt: Date

      // prevent message from being published to GraphQL subscription channel.
      $stopPropagation?: boolean
    }

    interface Node {
      id: string
      client: {
        type: string
        version: string
        langVersion: string
      }
      available: boolean
      lastHeartbeatTime: number
      hostname: string
      ipList: string[]
      services: UnderlyingService.ServiceSchema[]
    }

    /* Node instance example:

      Node {
        id: 'eunjus-imac.local-7513',
        available: true,
        local: false,
        lastHeartbeatTime: 1555488756931,
        config: {},
        client: { type: 'nodejs', version: '0.13.8', langVersion: 'v11.10.1' },
        ipList: [ '192.168.2.214' ],
        port: undefined,
        hostname: 'eunjus-iMac.local',
        udpAddress: null,
        cpu: 12,
        cpuSeq: 1,
        seq: 2,
        offlineSince: null,
        services:[
          { name: 'trade.stats',
           settings: {},
           metadata: { api: [Object] },
           actions:
            { 'trade.stats.list.by.broker': [Object],
              'trade.stats.list.by.group': [Object],
              'trade.stats.list.by.plant': [Object] },
           events: {} },
          { name: 'trade',
           settings: {},
           metadata: { api: [Object] },
           actions: {},
           events:
            { 'api.catalog.report.api**': [Object],
              'api.catalog.report.trade**': [Object] } }
        ],
      }

    */

    interface NodeStatus {
      uptimeSeconds:   number
      cpuTotal:        number
      cpuLoad1:        number
      cpuLoad5:        number
      cpuLoad15:       number
      cpuPercent:      number
      memTotal:        number
      memLoad:         number
      memFree:         number
      memPercent:      number
      sentPackets:     number
      sentBytes:       number
      receivedPackets: number
      receivedBytes:   number
    }

    interface APIRequestTrace {
      id?: string
      environment?: string
      gatewayNodeID?: string

      requestID: string
      contextID: string
      parentContextID: string
      level: number
      nodeID: string
      action: string
      params: any
      meta: any
      data: any
      error: any
      duration: number // ms
      createdAt: Date
    }

    interface EventEmission {
      id?: string
      environment?: string
      gatewayNodeID?: string

      nodeID: string
      event: string
      payload: any
      createdAt: Date
    }

    interface ServiceAPIDef {
      graphql?: ServiceGraphQLTypeDef[]
      rest?: ServiceRESTAliasDef[]
    }

    interface ServiceGraphQLTypeDef {
      service: string
      name: string
      description?: string
      kind: string
      source: string
      hasNodeResolver: boolean
      hasTypeResolver: boolean
      resolver: any
      actionFields: ServiceGraphQLActionFieldDef[]
    }

    interface ServiceGraphQLActionFieldDef {
      name: string
      description?: string
      action: string
      resolver: any
      guards: any[]
      paramMappings: any
    }

    interface ServiceRESTAliasDef {
      service: string
      path: string
      method: string
      description?: string
      action: string
      guards: any[]
      paramMappings: any
    }

    interface ActionParamMappings {
      [actionParamName: string]: {
        // mapping type
        type: "manual"|"implicit" // common
          // graphql
          |"source"|"args"|"context"
          // REST
          |"path"|"query|body"

        // target value or field name (include REST type casting)
        target: any

        // original api param config
        raw: any
      }
    }
  }
}

export = APIGateway;
