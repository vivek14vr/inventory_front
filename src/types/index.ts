export type UserRole = "ADMIN" | "WAREHOUSE_USER";

export type Warehouse = {
  _id: string;
  name: string;
  code: string;
  isActive: boolean;
};

export type Brand = {
  _id: string;
  name: string;
  isActive: boolean;
};

export type Product = {
  _id: string;
  name: string;
  brandId: string;
  isActive: boolean;
};
